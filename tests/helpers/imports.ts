import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

import { toPosixPath } from "./paths.js";
// listFiles is a general directory walk that happens to live beside the
// temporary-directory helpers; it is reused here rather than duplicated.
import { listFiles } from "./temporary-directory.js";

/** A module specifier appearing in a source file. */
export interface ImportReference {
  readonly specifier: string;
  /** 1-based line number, so failures can be opened directly in an editor. */
  readonly line: number;
}

/**
 * Extracts every module specifier a file references.
 *
 * `ts.preProcessFile` is TypeScript's own lightweight scanner. It is used here
 * instead of a regular expression because it understands the language: it picks
 * up static imports, `import type`, `export ... from`, and dynamic `import()`,
 * while ignoring anything that merely looks like an import inside a comment or
 * a string literal. A regular expression would report both false positives and
 * false negatives, and a boundary check that cries wolf gets disabled.
 */
export async function readImportReferences(
  file: string,
): Promise<ImportReference[]> {
  const text = await readFile(file, "utf8");
  const { importedFiles } = ts.preProcessFile(text, true, true);

  return importedFiles.map((imported) => ({
    specifier: imported.fileName,
    // preProcessFile reports character offsets; convert to a line number.
    line: text.slice(0, imported.pos).split("\n").length,
  }));
}

/**
 * Lists the TypeScript sources of a package, as absolute paths, excluding test
 * files. Boundary rules constrain what ships, and tests do not ship.
 */
export async function listSourceFiles(
  packageDirectory: string,
): Promise<string[]> {
  const sourceDirectory = path.join(packageDirectory, "src");
  const relative = await listFiles(sourceDirectory);

  return relative
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => path.join(sourceDirectory, ...toPosixPath(file).split("/")));
}
