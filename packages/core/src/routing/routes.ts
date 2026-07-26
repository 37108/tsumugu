import type { DocumentDiagnostic } from "../document/diagnostics.js";
import {
  toRoutePath,
  type RoutePath,
  type SourcePath,
} from "../document/paths.js";

/**
 * The mapping from a source file to its public route.
 *
 * The file system is the source of truth, so this is a convention, not a
 * configurable router. A reader looking at `docs/guide/setup.md` should be able
 * to predict `/guide/setup` without consulting a config file, and an author
 * moving a file should be able to predict what happens to its URL.
 *
 * Nothing here knows about HTTP. It maps paths to routes and reports when two
 * files want the same one.
 */

/** File names treated as a directory's own page. */
const indexNames = new Set(["index"]);

/** Extensions removed from a route, matched case-insensitively. */
const documentExtensions = new Set([".md", ".markdown", ".html", ".htm"]);

export const routingCodes = {
  collision: "routing/collision",
} as const;

export type RouteResult =
  | { readonly ok: true; readonly route: RoutePath }
  | { readonly ok: false; readonly message: string };

function splitExtension(name: string): {
  readonly stem: string;
  readonly extension: string;
} {
  const lastDot = name.lastIndexOf(".");
  // `<= 0` leaves a dotfile alone: `.md` is a file named ".md".
  if (lastDot <= 0) {
    return { stem: name, extension: "" };
  }
  return { stem: name.slice(0, lastDot), extension: name.slice(lastDot) };
}

/**
 * Maps a source path to its canonical route.
 *
 * The rules, and why each is what it is:
 *
 * - **Directory structure is preserved.** `guide/setup.md` is `/guide/setup`.
 *   A router that rearranged the tree would make the file system stop being a
 *   description of the site.
 *
 * - **A document extension is removed.** `.md`, `.markdown`, `.html` and `.htm`
 *   are all removed, so a page keeps its URL when it is converted from one
 *   format to the other. That is the whole point of HTML being a first-class
 *   input rather than a second format with its own URLs.
 *
 * - **An `index` file is its directory's page.** `guide/index.md` is `/guide`,
 *   and `index.md` at the root is `/`.
 *
 * - **Filename prefixes stay.** `01-install.md` is `/01-install`. Deciding that
 *   part of a name the author typed is ordering rather than identity is
 *   precisely the counterexample in `docs/principles.md`. An author who wants
 *   `/install` renames the file, which is visible and reversible.
 *
 * - **No trailing slash**, except at the root. `/guide` and `/guide/` are one
 *   page, and picking a canonical form is what stops them becoming two.
 *
 * The returned route is **decoded**: it holds the characters the author used,
 * including spaces and non-ASCII. Percent-encoding is applied when a route is
 * written into a URL, not when it is stored, so that routes compare as text and
 * cannot be double-encoded.
 */
export function routeForSource(sourcePath: SourcePath): RouteResult {
  const segments = sourcePath.split("/");
  const fileName = segments[segments.length - 1] ?? "";
  const directories = segments.slice(0, -1);

  const { stem, extension } = splitExtension(fileName);
  const isDocument = documentExtensions.has(extension.toLowerCase());
  const isIndex = isDocument && indexNames.has(stem.toLowerCase());

  const routeSegments = isIndex
    ? directories
    : [...directories, isDocument ? stem : fileName];

  const candidate = `/${routeSegments.join("/")}`;
  const result = toRoutePath(candidate === "/" ? "/" : candidate);

  return result.ok
    ? { ok: true, route: result.value }
    : { ok: false, message: result.error.message };
}

/**
 * Percent-encodes a route for use in a URL.
 *
 * Each segment is encoded on its own, so the `/` separators survive while every
 * character inside a segment that would otherwise change the URL's meaning —
 * `?`, `#`, `%`, a space — does not. A file really can be called `a?b.md`, and
 * emitting that unencoded would truncate the link at the question mark.
 */
export function encodeRoutePath(route: RoutePath): string {
  return route
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Reverses {@link encodeRoutePath} for an incoming request path.
 *
 * Returns `undefined` for input that cannot be decoded, rather than throwing:
 * a malformed percent-sequence is something a client sent, not a broken
 * invariant, and it must become a 400 rather than a crash.
 *
 * Decoding happens **before** validation, deliberately. `%2e%2e%2f` decodes to
 * `../`, and a check that ran first would wave it through.
 */
export function decodeRequestPath(requestPath: string): RoutePath | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return undefined;
  }

  const normalized =
    decoded.length > 1 && decoded.endsWith("/")
      ? decoded.slice(0, -1)
      : decoded;

  const result = toRoutePath(normalized);
  return result.ok ? result.value : undefined;
}

export interface RoutedSource {
  readonly sourcePath: SourcePath;
  readonly route: RoutePath;
}

/**
 * Reports files that want the same route.
 *
 * `guide.md` and `guide/index.md` both ask for `/guide`; so do `a.md` and
 * `a.html`. Whichever the server happened to serve would depend on scan order,
 * which is exactly the kind of bug that is impossible to reproduce. Reporting
 * it names every file involved so the author can choose.
 *
 * Deterministic: collisions are reported in route order, and each names its
 * sources in path order.
 */
export function findRouteCollisions(
  sources: readonly RoutedSource[],
): DocumentDiagnostic[] {
  const byRoute = new Map<RoutePath, SourcePath[]>();

  for (const source of sources) {
    const existing = byRoute.get(source.route);
    if (existing === undefined) {
      byRoute.set(source.route, [source.sourcePath]);
    } else {
      existing.push(source.sourcePath);
    }
  }

  const diagnostics: DocumentDiagnostic[] = [];

  for (const route of [...byRoute.keys()].sort()) {
    const paths = (byRoute.get(route) ?? []).slice().sort();
    if (paths.length < 2) {
      continue;
    }

    for (const sourcePath of paths) {
      diagnostics.push({
        code: routingCodes.collision,
        severity: "error",
        message: `"${sourcePath}" and ${paths.length - 1} other file(s) all map to "${route}": ${paths.join(", ")}. Rename or move one of them; which page is served would otherwise depend on the order the files were scanned.`,
        sourcePath,
      });
    }
  }

  return diagnostics;
}
