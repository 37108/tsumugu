import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createSite,
  type BuildOptions as SiteOptions,
  type DocumentDiagnostic,
} from "@tsumugu/core";

/**
 * The static build.
 *
 * A documentation server first, and this is an **adapter**: it asks the same
 * pipeline for the same pages the server would have served, and writes them to
 * disk. It renders nothing itself, decides no routes, and owns no theme. If
 * this file ever grows a second way to produce a page, the architecture has
 * failed and the fix is here rather than in core.
 *
 * ## Clean URLs
 *
 * `/guide/setup` is written as `guide/setup/index.html`, so the published URL is
 * the same address the development server answered. The alternative —
 * `guide/setup.html` — makes every link, anchor and bookmark differ between
 * `tsumugu dev` and the deployed site, and that difference is discovered in
 * production.
 *
 * ## What it will not do
 *
 * It will not empty a directory it does not recognise. A build tool that
 * deletes what it finds is one `--out ~/Documents` away from being a disaster,
 * so an output directory has to be empty, or one this tool wrote before, or
 * explicitly cleaned by the caller.
 */

export interface StaticBuildOptions extends Omit<
  SiteOptions,
  "root" | "siteName"
> {
  /** Absolute path to the documentation root. */
  readonly root: string;
  /** Absolute path to write to. Created when it does not exist. */
  readonly outDir: string;
  /**
   * Where the site will be published, for the sitemap's absolute URLs.
   *
   * Without it the sitemap is written with a placeholder origin and a
   * diagnostic says so, because a sitemap with the wrong origin is worse than
   * one that is obviously unfinished.
   */
  readonly origin?: string;
  /** Name shown in the header, when the home page does not provide one. */
  readonly siteName?: string;
  /**
   * Remove an output directory this tool did not write.
   *
   * Off by default. See the note above about `--out ~/Documents`.
   */
  readonly clean?: boolean;
}

export interface StaticBuildReport {
  readonly outDir: string;
  /** Files written, relative to `outDir`, POSIX-separated and sorted. */
  readonly files: readonly string[];
  readonly pageCount: number;
  readonly assetCount: number;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

/** Written into the output directory so a later build recognises its own work. */
const markerFile = ".tsumugu-build";

const markerContents = [
  "This directory was written by `tsumugu build`.",
  "It is emptied and rewritten by the next build.",
  "",
].join("\n");

export const buildCodes = {
  missingOrigin: "build/missing-origin",
  collision: "build/collision",
} as const;

/** The placeholder used when no origin was given. */
const placeholderOrigin = "https://example.invalid";

/** Where a route's HTML file goes: clean URLs, so `/guide` is `guide/index.html`. */
export function fileForRoute(route: string): string {
  const segments = route.split("/").filter((segment) => segment !== "");
  return [...segments, "index.html"].join("/");
}

async function isEmptyDirectory(directory: string): Promise<boolean> {
  try {
    return (await readdir(directory)).length === 0;
  } catch {
    // Not there at all, which is the emptiest a directory gets.
    return true;
  }
}

async function isOwnOutput(directory: string): Promise<boolean> {
  try {
    return (await readdir(directory)).includes(markerFile);
  } catch {
    return false;
  }
}

/** Writes a file, creating the directories above it. */
async function write(
  outDir: string,
  relative: string,
  contents: string | Uint8Array,
): Promise<void> {
  const target = path.join(outDir, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

/**
 * Builds the site into `outDir`.
 *
 * Everything the development server answers is written: the pages, the
 * generated landing and search pages, the machine-readable outputs, and the
 * files an author put beside their documents. What is deliberately absent is
 * the 404 page — a static host serves its own, and writing one to `404.html`
 * would be guessing at a convention that differs per host.
 */
export async function buildStatic(
  options: StaticBuildOptions,
): Promise<StaticBuildReport> {
  const diagnostics: DocumentDiagnostic[] = [];

  if (!(await isEmptyDirectory(options.outDir))) {
    if (await isOwnOutput(options.outDir)) {
      // Its own previous output: emptied, so a deleted document does not
      // survive in the deployment as a page nobody can reach from anywhere.
      await rm(options.outDir, { recursive: true, force: true });
    } else if (options.clean === true) {
      await rm(options.outDir, { recursive: true, force: true });
    } else {
      throw new Error(
        `${options.outDir} is not empty and was not written by tsumugu build. Point --out at a new directory, or pass --clean to remove this one.`,
      );
    }
  }

  const { root, outDir, origin, clean, siteName, ...composition } = options;
  void clean;

  const site = await createSite({
    root,
    ...composition,
    ...(siteName === undefined ? {} : { siteName }),
  });

  const result = site.result;
  diagnostics.push(...result.diagnostics);

  if (origin === undefined) {
    diagnostics.push({
      code: buildCodes.missingOrigin,
      severity: "warning",
      stage: "server",
      message: `No origin was given, so sitemap.xml was written with ${placeholderOrigin}.`,
      hint: "Pass --origin https://your.site so the sitemap points at where this is published.",
    });
  }

  const written = new Map<string, string>();

  const claim = (file: string, what: string): boolean => {
    const existing = written.get(file);
    if (existing !== undefined) {
      diagnostics.push({
        code: buildCodes.collision,
        severity: "error",
        stage: "routing",
        message: `${what} and ${existing} both want to be written to ${file}.`,
        hint: "Rename one of them. Only the first was written.",
      });
      return false;
    }
    written.set(file, what);
    return true;
  };

  for (const page of result.pages.values()) {
    const file = fileForRoute(page.route);
    if (claim(file, `the page at ${page.route}`)) {
      await write(outDir, file, page.html);
    }
  }

  for (const [route, output] of result.exports) {
    const file = route.replace(/^\//u, "");
    if (claim(file, `the generated ${file}`)) {
      await write(outDir, file, output.render(origin ?? placeholderOrigin));
    }
  }

  for (const asset of result.assets) {
    if (claim(asset, `the file ${asset}`)) {
      const target = path.join(outDir, ...asset.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(root, ...asset.split("/")), target);
    }
  }

  await write(outDir, markerFile, markerContents);

  return {
    outDir,
    files: [...written.keys(), markerFile].sort(),
    pageCount: result.pages.size,
    assetCount: result.assets.length,
    diagnostics,
  };
}
