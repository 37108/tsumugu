import path from "node:path";

import {
  buildSite,
  formatDiagnostics,
  serve,
  type DocumentDiagnostic,
  type RunningServer,
} from "@tsumugu/core";
import { createHtmlRenderer } from "@tsumugu/renderer-html";
import { createMarkdownRenderer } from "@tsumugu/renderer-markdown";

import { minimalTheme } from "./minimal-theme.js";

/**
 * The zero-config development command.
 *
 * This is the composition root: the one place that decides which renderers and
 * which theme an ordinary project gets. Core composes what it is handed and
 * chooses nothing, which is what keeps a different set of choices possible
 * without changing core.
 */

export interface DevOptions {
  /** Documentation root. Defaults to `./docs`. */
  readonly root?: string;
  readonly host?: string;
  readonly port?: number;
}

export interface DevResult {
  readonly server: RunningServer;
  readonly diagnostics: readonly DocumentDiagnostic[];
  /** How many pages were produced. */
  readonly pageCount: number;
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

    return {
      ok: false,
      message: `Unknown option "${argument ?? ""}". Supported: --root, --host, --port.`,
    };
  }

  return { ok: true, options };
}

/**
 * Builds the documentation and starts serving it.
 *
 * Returns rather than blocking, so a test can make a request and shut down.
 * The binary is what keeps the process alive.
 */
export async function startDev(options: DevOptions = {}): Promise<DevResult> {
  const root = path.resolve(options.root ?? "docs");

  const built = await buildSite({
    root,
    // Registration is explicit and ordered. Nothing is discovered from
    // node_modules, which is what keeps selection predictable.
    renderers: [createMarkdownRenderer(), createHtmlRenderer()],
    theme: minimalTheme,
  });

  const server = await serve({
    pages: built.pages,
    ...(options.host === undefined ? {} : { host: options.host }),
    ...(options.port === undefined ? {} : { port: options.port }),
  });

  const pageDiagnostics = [...built.pages.values()].flatMap(
    (page) => page.diagnostics,
  );

  return {
    server,
    diagnostics: [...built.diagnostics, ...pageDiagnostics],
    pageCount: built.pages.size,
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
      "Create one, for example docs/index.md, or point at another directory with --root.",
    );
  }

  if (result.diagnostics.length > 0) {
    lines.push("", formatDiagnostics(result.diagnostics));
  }

  return lines.join("\n");
}
