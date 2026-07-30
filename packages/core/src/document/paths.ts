/**
 * The three string-like identities a document has, kept apart by the type
 * system.
 *
 * A source path, a public route, and a document identifier are all strings, and
 * confusing them is the failure mode this module exists to prevent: serving a
 * file because a URL was treated as a path is a directory-traversal bug, not a
 * typo. Each is branded, so the only way to obtain one is through a constructor
 * that has validated it.
 */

declare const sourcePathBrand: unique symbol;
declare const routePathBrand: unique symbol;
declare const documentIdBrand: unique symbol;

/**
 * A documentation source file, relative to the documentation root, using `/`
 * separators on every platform.
 *
 * Relative rather than absolute so that the same project produces the same
 * identifiers, routes and cache keys regardless of where it is checked out.
 * POSIX-separated so that a path is comparable and printable without asking
 * which platform produced it.
 */
export type SourcePath = string & { readonly [sourcePathBrand]: "SourcePath" };

/** A public URL path, always beginning with `/`. */
export type RoutePath = string & { readonly [routePathBrand]: "RoutePath" };

/** Stable internal identity of a document across the pipeline. */
export type DocumentId = string & { readonly [documentIdBrand]: "DocumentId" };

/** Source formats the pipeline can currently represent. */
export type SourceFormat = "markdown" | "mdx" | "html" | "openapi";

/** Why a candidate path could not become a {@link SourcePath}. */
export type PathRejection =
  "empty" | "absolute" | "traversal" | "empty-segment" | "not-a-route";

export interface PathError {
  readonly rejection: PathRejection;
  readonly value: string;
  readonly message: string;
}

/**
 * Result of a validating constructor.
 *
 * Constructors return a result rather than throwing because invalid input is
 * expected here: the values come from a user's file system, not from Tsumugu.
 * A file the scanner cannot represent must become a diagnostic attached to the
 * project, not an exception that ends the process.
 */
export type PathResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PathError };

function failure(
  rejection: PathRejection,
  value: string,
  message: string,
): PathResult<never> {
  return { ok: false, error: { rejection, value, message } };
}

/**
 * Splits on both separators, so a Windows-produced path is accepted as input
 * even though only `/` is ever stored.
 */
function segmentsOf(value: string): string[] {
  return value.split(/[\\/]/);
}

/**
 * Normalizes a path discovered on disk into a {@link SourcePath}.
 *
 * Accepts either separator, because `path.relative` produces backslashes on
 * Windows, and always yields `/`. A leading `./` is dropped; anything else that
 * would change what the path refers to is rejected rather than repaired,
 * because silently rewriting a user's path is how a file ends up served from
 * somewhere they did not put it.
 */
export function toSourcePath(value: string): PathResult<SourcePath> {
  if (value === "") {
    return failure("empty", value, "A source path cannot be empty.");
  }
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:/.test(value)
  ) {
    return failure(
      "absolute",
      value,
      `"${value}" is absolute. Source paths are relative to the documentation root so that the same project produces the same routes wherever it is checked out.`,
    );
  }

  const segments = segmentsOf(value).filter((segment) => segment !== ".");

  if (segments.length === 0) {
    return failure("empty", value, "A source path must name a file.");
  }
  if (segments.includes("..")) {
    return failure(
      "traversal",
      value,
      `"${value}" escapes the documentation root. A document outside the root has no route and must not be served.`,
    );
  }
  if (segments.includes("")) {
    return failure(
      "empty-segment",
      value,
      `"${value}" contains an empty path segment.`,
    );
  }

  return { ok: true, value: segments.join("/") as SourcePath };
}

/**
 * Validates a public URL path.
 *
 * The mapping from a source path to a route — index files, extension removal,
 * trailing slashes, collisions — is deliberately not here; it belongs to the
 * routing rules. This function only decides whether a string is a shape the
 * server may serve.
 */
export function toRoutePath(value: string): PathResult<RoutePath> {
  if (!value.startsWith("/")) {
    return failure(
      "not-a-route",
      value,
      `"${value}" is not a route. A public route always begins with "/".`,
    );
  }
  if (value.includes("\\")) {
    return failure(
      "not-a-route",
      value,
      `"${value}" contains a backslash. Routes use "/" on every platform, so a Windows separator must never reach a URL.`,
    );
  }

  const segments = value.slice(1).split("/");
  const meaningful = segments.filter((segment, index) => {
    // A single trailing empty segment is the trailing slash, which is allowed.
    return !(segment === "" && index === segments.length - 1);
  });

  if (meaningful.includes("..") || meaningful.includes(".")) {
    return failure(
      "traversal",
      value,
      `"${value}" contains a relative segment. Routes are already normalized; a "." or ".." reaching this point means a URL was not decoded before it was resolved.`,
    );
  }
  if (meaningful.includes("")) {
    return failure(
      "empty-segment",
      value,
      `"${value}" contains an empty path segment.`,
    );
  }

  return { ok: true, value: value as RoutePath };
}

/**
 * Derives a document's identity from its source path.
 *
 * Identity is the normalized source path. That makes it stable across every
 * edit to a file's contents, which is what caches and change events need, and
 * it makes a rename a different document — the old identity disappears and a
 * new one appears. Detecting that those two events were "the same file moved"
 * is a separate problem and is not solved by guessing here.
 */
export function documentIdOf(path: SourcePath): DocumentId {
  return path as string as DocumentId;
}

const formatsByExtension = new Map<string, SourceFormat>([
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".mdx", "mdx"],
  [".html", "html"],
  [".htm", "html"],
]);

/**
 * Names that make a `.yaml` or `.json` file an API description.
 *
 * The name decides, not the contents (ADR 10). Claiming every `.yaml` and
 * `.json` file would sweep lock files, fixtures and configuration into the
 * scanner, and would let a data file's contents decide whether a route appears;
 * naming a file `api.openapi.yaml` is a deliberate act, and renaming it is how
 * a project opts back out.
 */
export const apiDescriptionExtensions = new Set([
  ".openapi.json",
  ".openapi.yaml",
  ".openapi.yml",
]);

export const apiDescriptionNames = new Set([
  "openapi.json",
  "openapi.yaml",
  "openapi.yml",
]);

/**
 * Classifies a source path by file extension, or returns `undefined` for a file
 * this build cannot represent.
 *
 * Extension matching is case-insensitive because macOS and Windows file systems
 * are, so `README.MD` and `readme.md` must classify the same way to avoid a
 * project behaving differently on different machines.
 *
 * Choosing which renderer handles a format is a separate decision; this only
 * says what the file is.
 */
export function detectSourceFormat(path: SourcePath): SourceFormat | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const lowered = name.toLowerCase();

  if (apiDescriptionNames.has(lowered)) {
    return "openapi";
  }
  // Checked before the single extension, because the last dot in
  // `api.openapi.yaml` finds `.yaml`, which is not a format on its own.
  for (const extension of apiDescriptionExtensions) {
    if (lowered.endsWith(extension) && lowered.length > extension.length) {
      return "openapi";
    }
  }

  const lastDot = name.lastIndexOf(".");
  // `<= 0` also excludes dotfiles: `.md` is a file named ".md", not a Markdown
  // document with an empty name.
  if (lastDot <= 0) {
    return undefined;
  }
  return formatsByExtension.get(lastDot === -1 ? "" : lowered.slice(lastDot));
}
