import path from "node:path";

import { buildStatic, type StaticBuildReport } from "tsumugu-build";
import { createPreset } from "tsumugu-preset";
import { createMdxRenderer } from "tsumugu-renderer-mdx";

import { siteNameFor } from "./dev.js";
import {
  parseLang,
  parseLocales,
  validateLocaleDirectories,
} from "./locales.js";
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
  /** Canonical locale directories built as isolated content scopes. */
  readonly locales?: readonly string[];
  /** Language for documents outside the locale scopes. */
  readonly lang?: string;
  readonly outDir?: string;
  readonly origin?: string;
  readonly basePath?: string;
  readonly clean?: boolean;
  /**
   * The operator's declaration that this root's content is theirs and may run
   * as code (ADR 7). Off by default, and never inferred.
   */
  readonly trust?: boolean;
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
    basePath?: string;
    clean?: boolean;
    trust?: boolean;
    locales?: readonly string[];
    lang?: string;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (
      argument === "--root" ||
      argument === "--out" ||
      argument === "--origin" ||
      argument === "--base"
    ) {
      if (value === undefined) {
        return { ok: false, message: `${argument} needs a value.` };
      }
      if (argument === "--root") {
        options.root = value;
      } else if (argument === "--out") {
        options.outDir = value;
      } else if (argument === "--base") {
        // Normalized once, here: one leading slash, no trailing one, so the
        // rest of the pipeline can concatenate without thinking about it.
        options.basePath = `/${value.replace(/^\/+|(?<!\/)\/+$/gu, "")}`;
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

    if (argument === "--trust") {
      options.trust = true;
      continue;
    }

    if (argument === "--locales") {
      if (options.locales !== undefined) {
        return { ok: false, message: "--locales can only be specified once." };
      }
      const parsed = parseLocales(value);
      if (!parsed.ok) {
        return parsed;
      }
      options.locales = parsed.value;
      index += 1;
      continue;
    }

    if (argument === "--lang") {
      if (options.lang !== undefined) {
        return { ok: false, message: "--lang can only be specified once." };
      }
      const parsed = parseLang(value);
      if (!parsed.ok) {
        return parsed;
      }
      options.lang = parsed.value;
      index += 1;
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
      message: `Unknown option "${argument ?? ""}". Supported: --root, --out, --origin, --base, --locales, --lang, --clean, --trust.`,
    };
  }

  return { ok: true, options };
}

/** Runs the build with the official composition. */
export async function runBuild(
  options: BuildCommandOptions & { readonly root: string },
): Promise<StaticBuildReport> {
  const root = path.resolve(options.root);
  const locales = await validateLocaleDirectories(root, options.locales);

  return buildStatic({
    root,
    outDir: path.resolve(options.outDir ?? defaultOutDir),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    ...(options.basePath === undefined ? {} : { basePath: options.basePath }),
    ...(locales === undefined ? {} : { locales }),
    ...(options.lang === undefined ? {} : { lang: options.lang }),
    ...(options.clean === undefined ? {} : { clean: options.clean }),
    ...(options.trust === true ? { trust: true } : {}),
    siteName: siteNameFor(root),
    ...createPreset(
      options.trust === true
        ? { trust: true, mdx: createMdxRenderer({ root }) }
        : {},
    ),
  });
}

/**
 * A size a person can read, in the `10 MB` shape `docs/designs/testing.md` uses.
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
  declaration: { readonly trust?: boolean } = {},
): string {
  const lines = [
    `${style.bold("tsumugu")}  built ${String(report.pageCount)} pages`,
    `${style.dim("  out   ")} ${report.outDir}`,
    `${style.dim("  files ")} ${String(report.files.length)}`,
    `${style.dim("  size  ")} ${formatSize(report.totalBytes)}`,
  ];

  if (declaration.trust === true) {
    // The declaration is loud on purpose: nobody should discover later that
    // their content was being emitted as written.
    lines.push(
      `${style.dim("  trust ")} on — this root's markup was emitted as written, scripts included, and its .mdx executed here`,
    );
  }

  if (report.diagnostics.length > 0) {
    lines.push("", formatForTerminal(report.diagnostics, style));
  }

  return lines.join("\n");
}
