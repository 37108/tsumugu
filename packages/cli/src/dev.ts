import { access, stat } from "node:fs/promises";
import path from "node:path";

import {
  createReloadChannel,
  createSite,
  reloadScript,
  serve,
  watchRoot,
  type DocumentDiagnostic,
  type RunningServer,
  type Site,
  type UpdateSummary,
} from "tsumugu-core";
import { createPreset } from "tsumugu-preset";
import { createMdxRenderer } from "tsumugu-renderer-mdx";

import { formatForTerminal, styleFor, type TerminalStyle } from "./terminal.js";

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
  /** Watch the root and rebuild on change. On unless turned off. */
  readonly watch?: boolean;
  /**
   * Reload open browser tabs after a rebuild. On unless watching is off.
   *
   * This is the only thing that puts JavaScript on a Tsumugu page, and it is
   * one script Tsumugu wrote, allowed by its hash. Turning it off returns the
   * pages to running nothing at all.
   */
  readonly liveReload?: boolean;
  /**
   * The operator's declaration that this root's content is theirs and may run
   * as code (ADR 7). Off by default, and never inferred.
   */
  readonly trust?: boolean;
  /** Called after a rebuild triggered by a file change. */
  readonly onUpdate?: (summary: UpdateSummary) => void;
  /** Called when a rebuild failed, which leaves the last good site served. */
  readonly onUpdateFailed?: (cause: unknown) => void;
}

export interface DevResult {
  readonly server: RunningServer;
  /** The site being served, which rebuilds itself as files change. */
  readonly site: Site;
  /** Whether the root is being watched. */
  readonly watching: boolean;
  readonly diagnostics: readonly DocumentDiagnostic[];
  /** How many documents the project has. Generated pages are not counted. */
  readonly pageCount: number;
  /** Whether the operator declared the root trusted, for the startup notice. */
  readonly trust: boolean;
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
  const options: {
    root?: string;
    host?: string;
    port?: number;
    trust?: boolean;
  } = {};

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

    if (argument === "--trust") {
      options.trust = true;
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
      message: `Unknown option "${argument ?? ""}". Supported: --root, --host, --port, --trust.`,
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
  const watching = options.watch !== false;
  // Reloading a browser when nothing is watching for changes would be a script
  // that can never fire, so the two are one decision unless asked otherwise.
  const reloading = watching && options.liveReload !== false;
  const reload = reloading ? createReloadChannel() : undefined;

  const site = await createSite({
    root,
    // Which renderers, transformers and theme a project gets is the preset's
    // decision, not the CLI's. The CLI parses a command line and prints to a
    // terminal; a programmatic consumer composes the same preset without it.
    ...createPreset(
      options.trust === true
        ? { trust: true, mdx: createMdxRenderer({ root }) }
        : {},
    ),
    siteName: siteNameFor(root),
    ...(reloading ? { script: reloadScript } : {}),
    ...(options.trust === true ? { trust: true } : {}),
  });

  const server = await serve({
    // Asked per request, so an edit is served as soon as the rebuild finishes.
    site: () => site.result,
    assetRoot: root,
    ...(reload === undefined ? {} : { liveReload: reload }),
    ...(options.host === undefined ? {} : { host: options.host }),
    ...(options.port === undefined ? {} : { port: options.port }),
  });

  // Rebuilds are serialized through one promise: a second burst of saves while
  // a rebuild is running waits for it rather than racing it, so the site never
  // reflects half of one edit and half of another.
  let pending: Promise<void> = Promise.resolve();

  const watcher = !watching
    ? undefined
    : watchRoot(root, () => {
        pending = pending
          .then(async () => {
            const summary = await site.update();
            // Only after the rebuild finished: a browser told to reload
            // early would fetch the page it already had.
            reload?.notify();
            options.onUpdate?.(summary);
          })
          .catch((cause: unknown) => {
            options.onUpdateFailed?.(cause);
          });
      });

  return {
    server: {
      ...server,
      close: async () => {
        watcher?.close();
        await server.close();
      },
    },
    watching,
    site,
    trust: options.trust === true,
    diagnostics: currentDiagnostics(site),
    // Generated pages are not counted: a project with no documents should be
    // told it has none, not told it has one it did not write.
    pageCount: authoredPageCount(site),
  };
}

/** Diagnostics from the project as a whole and from every page in it. */
function currentDiagnostics(site: Site): readonly DocumentDiagnostic[] {
  return [
    ...site.result.diagnostics,
    ...[...site.result.pages.values()].flatMap((page) => page.diagnostics),
  ];
}

/**
 * The line printed after a rebuild.
 *
 * It says what changed rather than only that something did, because "updated"
 * on its own leaves the author wondering whether their file was the one.
 */
export function describeUpdate(
  summary: UpdateSummary,
  style: TerminalStyle = styleFor(),
): string {
  const documents =
    summary.rendered === 1
      ? "1 document"
      : `${String(summary.rendered)} documents`;
  const removed =
    summary.removed === 0 ? "" : `, ${String(summary.removed)} removed`;

  return `${style.bold("rebuilt")}  ${documents}${removed} ${style.dim(
    `in ${String(Math.round(summary.durationMs))} ms`,
  )}`;
}

/** Pages an author wrote, which is what "how many pages" means to them. */
function authoredPageCount(site: Site): number {
  return [...site.result.pages.values()].filter(
    (page) => page.generated !== true,
  ).length;
}

/** The startup message, as a string rather than written to a stream. */
export function describeStartup(
  result: DevResult,
  root: string,
  style: TerminalStyle = styleFor(),
): string {
  const lines = [
    `${style.bold("tsumugu")}  ${style.accent(result.server.url)}`,
    `${style.dim("  root  ")} ${root}`,
    `${style.dim("  pages ")} ${String(result.pageCount)}`,
    `${style.dim("  watch ")} ${
      result.watching ? "on, pages reload themselves after a save" : "off"
    }`,
  ];

  if (result.trust) {
    // The declaration is loud on purpose: nobody should discover later that
    // their content was being emitted as written.
    lines.push(
      `${style.dim("  trust ")} on — this root's markup is emitted as written, its scripts run, and its .mdx executes here`,
    );
  }

  if (result.pageCount === 0) {
    // The single most likely first-run problem, answered before it is asked.
    lines.push(
      "",
      `No documents were found in ${root}.`,
      "Add a Markdown or HTML file to it: index.md becomes the home page.",
    );
  }

  if (result.diagnostics.length > 0) {
    lines.push("", formatForTerminal(result.diagnostics, style));
  }

  return lines.join("\n");
}

/**
 * What is printed when a rebuild fails.
 *
 * The site being served is the last one that built, so this is news rather than
 * an emergency, and the message says so: an author who has just saved a broken
 * file should not have to wonder whether their server is still up.
 */
export function describeUpdateFailure(
  cause: unknown,
  style: TerminalStyle = styleFor(),
): string {
  const message = cause instanceof Error ? cause.message : String(cause);

  return [
    `${style.error("rebuild failed")}  ${message}`,
    style.dim("  still serving the last version that built"),
  ].join("\n");
}
