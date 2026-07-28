import { access, stat } from "node:fs/promises";
import path from "node:path";

import {
  buildSite,
  createHeadingIdTransformer,
  formatDiagnostics,
  serve,
  type DocumentDiagnostic,
  type RunningServer,
} from "@tsumugu/core";
import { createHtmlRenderer } from "@tsumugu/renderer-html";
import { createMarkdownRenderer } from "@tsumugu/renderer-markdown";
import { defaultTheme } from "@tsumugu/theme-default";

/**
 * The zero-config development command.
 *
 * This is the composition root: the one place that decides which renderers,
 * which transformers and which theme an ordinary project gets. Core composes
 * what it is handed and chooses nothing, which is what keeps a different set of
 * choices possible without changing core.
 */

export interface DevOptions {
  /** Documentation root. Discovered by convention when omitted. */
  readonly root?: string;
  readonly host?: string;
  readonly port?: number;
}

export interface DevResult {
  readonly server: RunningServer;
  readonly diagnostics: readonly DocumentDiagnostic[];
  /** How many documents the project has. Generated pages are not counted. */
  readonly pageCount: number;
}

/** Files that make a directory a documentation root on their own. */
const indexFiles = ["index.md", "index.markdown", "index.html", "index.htm"];

/** The conventional directory name, checked before the working directory. */
const conventionalDirectory = "docs";

export interface RootDiscovery {
  readonly root: string;
  /** How the root was chosen, for the startup message. */
  readonly reason: "explicit" | "conventional" | "working-directory";
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function hasIndexDocument(directory: string): Promise<boolean> {
  for (const name of indexFiles) {
    try {
      await access(path.join(directory, name));
      return true;
    } catch {
      // Not this one. A missing file is the ordinary case here, not a failure.
    }
  }
  return false;
}

/**
 * Decides which directory to serve.
 *
 * Three rules, in order, and no more than three:
 *
 * 1. **What the user said.** An explicit path is never second-guessed.
 * 2. **`./docs`**, if it exists. The convention nearly every repository already
 *    follows, which is what makes zero configuration possible.
 * 3. **The working directory**, but only if it contains an index document.
 *
 * The last condition is the important one. A working directory with no index is
 * far more likely to be somebody's project root than their documentation, and
 * serving it would scan every stray Markdown file in the repository. Refusing
 * is cheap, and the message says exactly what to do instead.
 */
export async function discoverRoot(
  explicit: string | undefined,
  workingDirectory: string = process.cwd(),
): Promise<
  | { readonly ok: true; readonly discovery: RootDiscovery }
  | { readonly ok: false; readonly message: string }
> {
  if (explicit !== undefined) {
    const resolved = path.resolve(workingDirectory, explicit);
    if (!(await isDirectory(resolved))) {
      return {
        ok: false,
        message: `${resolved} is not a directory. Point tsumugu at the directory your documentation is in.`,
      };
    }
    return { ok: true, discovery: { root: resolved, reason: "explicit" } };
  }

  const conventional = path.resolve(workingDirectory, conventionalDirectory);
  if (await isDirectory(conventional)) {
    return {
      ok: true,
      discovery: { root: conventional, reason: "conventional" },
    };
  }

  if (await hasIndexDocument(workingDirectory)) {
    return {
      ok: true,
      discovery: {
        root: path.resolve(workingDirectory),
        reason: "working-directory",
      },
    };
  }

  return {
    ok: false,
    message: `No documentation was found. Create a ${conventionalDirectory}/ directory, or run "tsumugu dev <directory>" to serve another one.`,
  };
}

/** Parses `tsumugu dev` arguments. Unknown flags are an error, not a guess. */
export function parseDevOptions(
  argv: readonly string[],
):
  | { readonly ok: true; readonly options: DevOptions }
  | { readonly ok: false; readonly message: string } {
  const options: { root?: string; host?: string; port?: number } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--root" || argument === "--host") {
      if (value === undefined) {
        return { ok: false, message: `${argument} needs a value.` };
      }
      if (argument === "--root") {
        options.root = value;
      } else {
        options.host = value;
      }
      index += 1;
      continue;
    }

    if (argument === "--port") {
      const port = Number(value);
      if (
        value === undefined ||
        !Number.isInteger(port) ||
        port < 0 ||
        port > 65535
      ) {
        return {
          ok: false,
          message: "--port needs a whole number between 0 and 65535.",
        };
      }
      options.port = port;
      index += 1;
      continue;
    }

    // A bare argument is the directory to serve, so `tsumugu dev site` works
    // without anyone having to learn a flag first.
    if (
      argument !== undefined &&
      argument !== "" &&
      !argument.startsWith("-") &&
      options.root === undefined
    ) {
      options.root = argument;
      continue;
    }

    return {
      ok: false,
      message: `Unknown option "${argument ?? ""}". Supported: --root, --host, --port.`,
    };
  }

  return { ok: true, options };
}

/**
 * The name shown in the header and in the browser title.
 *
 * A directory called `docs` says nothing, so the directory above it is used
 * instead — which in an ordinary repository is the project. It is a label
 * derived from the file system, not a claim about the project; an author who
 * wants something else writes an `index.md` with a title in it.
 */
export function siteNameFor(root: string): string {
  const base = path.basename(root);
  const parent = path.basename(path.dirname(root));

  const chosen =
    base.toLowerCase() === conventionalDirectory && parent !== ""
      ? parent
      : base;

  return chosen === "" || chosen === "." ? "Documentation" : chosen;
}

/**
 * Builds the documentation and starts serving it.
 *
 * Returns rather than blocking, so a test can make a request and shut down.
 * The binary is what keeps the process alive.
 */
export async function startDev(options: DevOptions = {}): Promise<DevResult> {
  const root = path.resolve(options.root ?? conventionalDirectory);

  const built = await buildSite({
    root,
    // Registration is explicit and ordered. Nothing is discovered from
    // node_modules, which is what keeps selection predictable.
    renderers: [createMarkdownRenderer(), createHtmlRenderer()],
    // Anchors are what make a section linkable, so every project gets them by
    // default. A project that wants different ones registers a different
    // transformer here rather than configuring this one.
    transformers: [createHeadingIdTransformer()],
    theme: defaultTheme,
    siteName: siteNameFor(root),
  });

  const server = await serve({
    pages: built.pages,
    assetRoot: root,
    renderNotFound: built.renderNotFound,
    renderBadRequest: built.renderBadRequest,
    ...(options.host === undefined ? {} : { host: options.host }),
    ...(options.port === undefined ? {} : { port: options.port }),
  });

  const pageDiagnostics = [...built.pages.values()].flatMap(
    (page) => page.diagnostics,
  );

  return {
    server,
    diagnostics: [...built.diagnostics, ...pageDiagnostics],
    // Generated pages are not counted: a project with no documents should be
    // told it has none, not told it has one it did not write.
    pageCount: [...built.pages.values()].filter(
      (page) => page.generated !== true,
    ).length,
  };
}

/** The startup message, as a string rather than written to a stream. */
export function describeStartup(result: DevResult, root: string): string {
  const lines = [
    `tsumugu  ${result.server.url}`,
    `  root   ${root}`,
    `  pages  ${String(result.pageCount)}`,
  ];

  if (result.pageCount === 0) {
    // The single most likely first-run problem, answered before it is asked.
    lines.push(
      "",
      `No documents were found in ${root}.`,
      "Add a Markdown or HTML file to it: index.md becomes the home page.",
    );
  }

  if (result.diagnostics.length > 0) {
    lines.push("", formatDiagnostics(result.diagnostics));
  }

  return lines.join("\n");
}
