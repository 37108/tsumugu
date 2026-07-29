import { realpathSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "@mdx-js/mdx";
import type { Plugin } from "esbuild";
import type {
  DocumentDiagnostic,
  LoadedDocument,
  RenderResult,
  Renderer,
} from "tsumugu-core";
import { createHtmlRenderer } from "tsumugu-renderer-html";
import {
  createMarkdownRenderer,
  markdownCodes,
} from "tsumugu-renderer-markdown";

/**
 * The executing MDX renderer.
 *
 * ADR 6 decided that `.mdx` never executes by default, and named the shape of
 * the exception: an opt-in renderer that owns the execution decision. This is
 * that renderer (ADR 7, third phase). It exists to be composed only when the
 * operator has declared the root trusted; it is never part of the default
 * composition, and it does not decide trust — whoever composes it did.
 *
 * ## How a document becomes a page
 *
 * The file is compiled with the real MDX compiler, bundled with esbuild —
 * relative imports resolve inside the root and nowhere else, bare specifiers
 * resolve like any Node import, `.jsx`/`.tsx` compile on the way — and the
 * bundle is evaluated in this process. The default export renders to static
 * HTML with Preact, and that HTML flows through the ordinary HTML conversion,
 * so anchors, search, highlighting and exports see the executed document and
 * no framework runtime is ever sent to a reader.
 *
 * ## When it fails
 *
 * A file that will not compile or throws while evaluating gets one diagnostic
 * naming the file and the cause, and renders exactly as ADR 6 renders it:
 * Markdown in full, dynamic islands as escaped source. A broken file costs
 * its islands, never the site.
 */

export const mdxCodes = {
  executionFailed: "renderer-mdx/execution-failed",
  inlineScript: "renderer-mdx/inline-script",
} as const;

export interface MdxRendererOptions {
  /**
   * Absolute path to the documentation root.
   *
   * Needed because imports are files: relative imports resolve against the
   * importing document and must stay inside this directory. An import that
   * points outside it fails the compilation, whatever it is spelled as.
   */
  readonly root: string;
  /** Identifier for this renderer instance. */
  readonly id?: string;
}

/**
 * Removes front matter, keeping every line number.
 *
 * The Markdown fallback pass reads the front matter (shared precedence rules
 * and all); the MDX compiler would render it as a thematic break followed by
 * prose. Blanking it rather than cutting it keeps compiler positions pointing
 * at the author's real lines.
 */
function blankFrontMatter(source: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source);
  if (match === null) {
    return source;
  }
  return match[0].replaceAll(/[^\n]/gu, "") + source.slice(match[0].length);
}

/**
 * Replaces machine paths in a message with root-relative ones.
 *
 * A build error names files by absolute path, and an absolute path names the
 * machine. Both spellings of the root are stripped, because a symbolic link
 * means a message can carry either.
 */
function withoutRoots(message: string, roots: readonly string[]): string {
  let stripped = message;
  for (const root of roots) {
    stripped = stripped
      .replaceAll(`${root}${path.sep}`, "")
      .replaceAll(root, ".");
  }
  return stripped;
}

/**
 * Whether a path, followed through any symbolic links, is inside the root.
 *
 * Real paths on both sides, like the asset layer: a link is judged by where
 * it points, not by how it is spelled. A path that does not exist cannot
 * escape anything — esbuild reports it as the missing import it is.
 */
function insideRoot(realRoot: string, candidate: string): boolean {
  let resolved = candidate;
  try {
    resolved = realpathSync(candidate);
  } catch {
    // Not there yet, or not readable. Judged as written.
  }
  const relative = path.relative(realRoot, resolved);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

/**
 * Compiles `.mdx` on load and refuses any file import that leaves the root.
 *
 * The refusal happens at resolution, not by sanitizing the path: whatever an
 * import is spelled as, it is resolved first and the resolved file is either
 * inside the root or the build fails. Bare specifiers are not file paths and
 * pass through to ordinary Node resolution — packages the operator installed
 * are inside the declaration.
 */
function mdxPlugin(realRoot: string): Plugin {
  return {
    name: "tsumugu-mdx",
    setup(pluginBuild) {
      pluginBuild.onResolve(
        { filter: /^\.\.?\/|^\// },
        (args): { errors: { text: string }[] } | undefined => {
          // Only what a document imports is judged. A package's own internal
          // relative imports live in `node_modules` and are outside the root
          // by construction; refusing those would report the root boundary
          // for something that is really an ordinary npm dependency.
          if (args.importer !== "" && !insideRoot(realRoot, args.importer)) {
            return undefined;
          }
          const resolved = path.resolve(args.resolveDir, args.path);
          if (!insideRoot(realRoot, resolved)) {
            return {
              errors: [
                {
                  text: `"${args.path}" resolves outside the documentation root. The --trust declaration covers the root and nothing beyond it.`,
                },
              ],
            };
          }
          return undefined;
        },
      );

      pluginBuild.onLoad({ filter: /\.mdx$/ }, async (args) => {
        const source = await readFile(args.path, "utf8");
        const compiled = await compile(blankFrontMatter(source), {
          // Left as JSX for esbuild to lower, so a document and the
          // components it imports go through one JSX configuration. The
          // import source has to be named here as well as in the bundle
          // options: the compiler writes a pragma comment, and a pragma wins
          // over configuration.
          jsx: true,
          jsxImportSource: "preact",
        });
        return {
          contents: String(compiled),
          loader: "jsx",
          resolveDir: path.dirname(args.path),
        };
      });
    },
  };
}

/** Bundles one document and renders its default export to HTML. */
async function executeToHtml(
  realRoot: string,
  filePath: string,
): Promise<string> {
  const wrapper = [
    `import MDXContent from ${JSON.stringify(filePath)};`,
    `import { h } from "preact";`,
    `import { render } from "preact-render-to-string";`,
    `export default () => render(h(MDXContent, {}));`,
  ].join("\n");

  // Imported here rather than at module scope: esbuild asserts things about
  // its host environment the moment it loads, and merely composing a site
  // must not depend on the environment that will execute a document. A root
  // with no `.mdx` never loads it at all.
  const { build } = await import("esbuild");

  const bundled = await build({
    stdin: {
      contents: wrapper,
      resolveDir: path.dirname(filePath),
      sourcefile: "tsumugu-mdx-entry.js",
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    jsxImportSource: "preact",
    logLevel: "silent",
    // A documentation root is rarely a JavaScript project. The renderer's own
    // dependencies — Preact, its JSX runtime, the SSR call — resolve from
    // this package as a fallback, after anything the root itself provides.
    nodePaths: [fileURLToPath(new URL("../node_modules", import.meta.url))],
    plugins: [mdxPlugin(realRoot)],
  });

  const code = bundled.outputFiles[0]?.text ?? "";
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(code, "utf8").toString("base64")}`
  )) as { default: () => string };

  return module.default();
}

/**
 * Builds the executing MDX renderer.
 *
 * Compose it ahead of a Markdown renderer that declines `.mdx`; two renderers
 * claiming the same document is a composition error by design.
 */
export function createMdxRenderer(options: MdxRendererOptions): Renderer {
  const id = options.id ?? "mdx";
  const root = path.resolve(options.root);
  // Resolved once, through any symbolic links, so imports are judged against
  // the same real directory the files are read from — `/tmp` being a link to
  // `/private/tmp` must not make every import look like an escape.
  let realRoot: Promise<string> | undefined;

  // The non-executing pass: front matter through the shared precedence rules,
  // and the ADR 6 rendering to fall back to. One implementation of both,
  // reused rather than restated.
  const fallback = createMarkdownRenderer({ scripts: "preserve" });
  // Executed output is HTML like any other, including the script handling the
  // trusted composition uses everywhere else.
  const html = createHtmlRenderer({ scripts: "preserve" });

  return {
    id,

    supports: (document: LoadedDocument): boolean => document.format === "mdx",

    render: async (document: LoadedDocument): Promise<RenderResult> => {
      const preserved = await fallback.render(document);

      let executed: string;
      // Both spellings, for the message: the root as the operator wrote it,
      // and the root any symbolic link resolves to.
      const roots = [root];
      try {
        realRoot ??= realpath(root);
        const resolvedRoot = await realRoot;
        roots.push(resolvedRoot);
        executed = await executeToHtml(
          resolvedRoot,
          path.join(resolvedRoot, document.sourcePath),
        );
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        const diagnostic: DocumentDiagnostic = {
          code: mdxCodes.executionFailed,
          // A warning, not an error: `error` means the document cannot be
          // produced, and this one is produced — without execution, which is
          // exactly how every root without the declaration produces it.
          severity: "warning",
          stage: "renderer",
          message: `"${document.sourcePath}" could not be executed: ${withoutRoots(message, roots)}`,
          hint: "The document renders without execution instead: Markdown in full, expressions and components as written.",
          sourcePath: document.sourcePath,
          cause,
        };
        return {
          ...preserved,
          diagnostics: [...(preserved.diagnostics ?? []), diagnostic],
        };
      }

      const converted = html.render({
        ...document,
        format: "html",
        content: executed,
      });
      if (converted instanceof Promise) {
        throw new Error("the HTML renderer is synchronous");
      }

      // An inline `<script>` written in MDX cannot be trusted to survive:
      // MDX parses its children as content, and the renderer escapes them, so
      // what reaches the page is not what the author typed. Hashing that
      // would allow a script nobody wrote. The element is still emitted —
      // nothing is dropped — but it carries no hash, so the browser refuses
      // it, and the author is told to move it into a file instead.
      const inlineScripts =
        converted.scripts === undefined
          ? []
          : [
              {
                code: mdxCodes.inlineScript,
                severity: "warning" as const,
                stage: "renderer" as const,
                message: `An inline script in "${document.sourcePath}" cannot run: MDX reads a script's content as document content, not as code.`,
                hint: 'Move it to a file beside the document and reference it: <script src="./demo.js"></script>.',
                sourcePath: document.sourcePath,
              },
            ];

      return {
        root: converted.root,
        // The document's own front matter still wins the shared precedence;
        // execution changes what the page shows, not what it is called.
        ...(preserved.metadata === undefined
          ? {}
          : { metadata: preserved.metadata }),
        diagnostics: [
          // Front-matter problems are real either way; the fallback's
          // "shown as written" island warnings are not — executed, the
          // islands are neither preserved nor source.
          ...(preserved.diagnostics ?? []).filter(
            (diagnostic) =>
              diagnostic.code !== markdownCodes.unsupported &&
              diagnostic.code !== markdownCodes.splitScript,
          ),
          ...(converted.diagnostics ?? []),
          ...inlineScripts,
        ],
      };
    },
  };
}
