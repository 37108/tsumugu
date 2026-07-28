import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { RoutePath } from "../document/paths.js";

/**
 * Static assets.
 *
 * Documentation references images, diagrams and the occasional download, and
 * those files sit beside the documents that use them. Serving them is
 * therefore necessary — and it is the part of a documentation server most
 * likely to become a way to read files it was never meant to.
 *
 * So the policy here is a deny-list nested inside an allow-list, and every rule
 * is stated as code rather than as a convention:
 *
 * - a request is resolved **and then checked**, through `realpath`, so a
 *   symbolic link that leaves the documentation root is rejected by where it
 *   actually points rather than by how it is spelled;
 * - dotfiles and dot directories are refused outright, which is what keeps
 *   `.env`, `.git` and an editor's swap files private by default;
 * - a file with no known type is served as a download, never as HTML, so an
 *   unknown format cannot become markup a browser executes;
 * - JavaScript is served as text. Documentation JavaScript does not run: the
 *   content security policy forbids it, and the content type agrees;
 * - directories produce nothing. A listing is a map of a project's file system,
 *   given away to anyone who guesses a path.
 *
 * Nothing here reads or transforms document content. An asset is bytes.
 */

export type AssetResult =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array;
      readonly contentType: string;
    }
  | { readonly ok: false };

/**
 * Content types, by extension.
 *
 * Deliberately a short list of what documentation actually contains. Guessing
 * from content is how a file becomes the wrong thing, and a long list is a long
 * list of chances to guess wrong.
 */
const contentTypes = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".pdf", "application/pdf"],
  [".txt", "text/plain; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".json", "application/json"],
  [".css", "text/css; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".zip", "application/zip"],
  // Served as text on purpose. A documentation tree may contain example
  // scripts; they are examples, and this is what stops one becoming a script
  // the browser runs.
  [".js", "text/plain; charset=utf-8"],
  [".mjs", "text/plain; charset=utf-8"],
  [".ts", "text/plain; charset=utf-8"],
  [".map", "text/plain; charset=utf-8"],
]);

/**
 * Extensions that belong to documents.
 *
 * A document is served as a rendered page at its own route. Serving its source
 * as an asset as well would give every page two addresses, one of them
 * unstyled, and would publish front matter an author may not have meant to
 * show.
 */
const documentExtensions = new Set([
  ".md",
  ".markdown",
  ".mdx",
  ".html",
  ".htm",
]);

/**
 * Serving an asset must never be a way to learn what a project's file system
 * looks like, so a refusal and a missing file are the same answer.
 */
const refused: AssetResult = { ok: false };

/** Whether any segment of the route is hidden or would escape the root. */
function hasUnsafeSegment(segments: readonly string[]): boolean {
  return segments.some(
    (segment) =>
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      segment.startsWith("."),
  );
}

/**
 * Reads the asset a route points at, or refuses.
 *
 * `root` must be an absolute path to the documentation root.
 */
export async function readAsset(
  root: string,
  route: RoutePath,
): Promise<AssetResult> {
  const segments = route.split("/").filter((segment) => segment !== "");

  if (segments.length === 0 || hasUnsafeSegment(segments)) {
    return refused;
  }

  const extension = path
    .extname(segments[segments.length - 1] ?? "")
    .toLowerCase();
  if (extension === "" || documentExtensions.has(extension)) {
    return refused;
  }

  const candidate = path.join(root, ...segments);

  let resolved: string;
  let resolvedRoot: string;
  try {
    // Resolving both sides is what makes the comparison meaningful: the root
    // itself may be reached through a link, and comparing a resolved path to
    // an unresolved root would refuse every request on such a machine.
    resolved = await realpath(candidate);
    resolvedRoot = await realpath(root);
  } catch {
    return refused;
  }

  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    // The file exists, but not inside the documentation root — a symbolic link
    // pointing outside it, which is exactly the case the check is for.
    return refused;
  }

  try {
    const stats = await stat(resolved);
    if (!stats.isFile()) {
      return refused;
    }

    return {
      ok: true,
      bytes: await readFile(resolved),
      // An unknown type is a download, never markup.
      contentType: contentTypes.get(extension) ?? "application/octet-stream",
    };
  } catch {
    return refused;
  }
}
