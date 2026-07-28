import path from "node:path";

import { buildStatic, type StaticBuildReport } from "tsumugu-build";
import { createPreset } from "tsumugu-preset";

import { siteNameFor } from "./dev.js";
import { formatForTerminal, styleFor, type TerminalStyle } from "./terminal.js";

/**
 * The `build` command.
 *
 * Same composition as `dev`, same pipeline, different destination. That is the
 * whole claim the static build makes, and keeping this file short is how it
 * stays true.
 */

export interface BuildCommandOptions {
  readonly root?: string;
  readonly outDir?: string;
  readonly origin?: string;
  readonly clean?: boolean;
}

/** Where output goes when nobody said. */
const defaultOutDir = "dist";

/** Parses `tsumugu build` arguments. Unknown flags are an error, not a guess. */
export function parseBuildOptions(
  argv: readonly string[],
):
  | { readonly ok: true; readonly options: BuildCommandOptions }
  | { readonly ok: false; readonly message: string } {
  const options: {
    root?: string;
    outDir?: string;
    origin?: string;
    clean?: boolean;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (
      argument === "--root" ||
      argument === "--out" ||
      argument === "--origin"
    ) {
      if (value === undefined) {
        return { ok: false, message: `${argument} needs a value.` };
      }
      if (argument === "--root") {
        options.root = value;
      } else if (argument === "--out") {
        options.outDir = value;
      } else {
        options.origin = value;
      }
      index += 1;
      continue;
    }

    if (argument === "--clean") {
      options.clean = true;
      continue;
    }

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
      message: `Unknown option "${argument ?? ""}". Supported: --root, --out, --origin, --clean.`,
    };
  }

  return { ok: true, options };
}

/** Runs the build with the official composition. */
export async function runBuild(
  options: BuildCommandOptions & { readonly root: string },
): Promise<StaticBuildReport> {
  const root = path.resolve(options.root);

  return buildStatic({
    root,
    outDir: path.resolve(options.outDir ?? defaultOutDir),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    ...(options.clean === undefined ? {} : { clean: options.clean }),
    siteName: siteNameFor(root),
    ...createPreset(),
  });
}

/**
 * A size a person can read, in the `10 MB` shape `docs/testing.md` uses.
 *
 * Powers of 1024, one decimal above bytes, no locale formatting — the same
 * project prints the same string on every machine.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** What the terminal says when a build finishes. */
export function describeBuild(
  report: StaticBuildReport,
  style: TerminalStyle = styleFor(),
): string {
  const lines = [
    `${style.bold("tsumugu")}  built ${String(report.pageCount)} pages`,
    `${style.dim("  out   ")} ${report.outDir}`,
    `${style.dim("  files ")} ${String(report.files.length)}`,
    `${style.dim("  size  ")} ${formatSize(report.totalBytes)}`,
  ];

  if (report.diagnostics.length > 0) {
    lines.push("", formatForTerminal(report.diagnostics, style));
  }

  return lines.join("\n");
}
