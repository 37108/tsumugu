import type { DocumentDiagnostic } from "../document/diagnostics.js";
import {
  toRoutePath,
  type RoutePath,
  type SourcePath,
} from "../document/paths.js";
import { routeForSource } from "../routing/routes.js";

import type { CollectedLink } from "./collect.js";

/**
 * Link validation.
 *
 * A broken link is the most common thing wrong with documentation, and it is
 * one of the few problems a documentation server can find on its own: Tsumugu
 * already knows every route, every heading identifier and every file in the
 * root, so a link to a page that does not exist is a fact rather than a guess.
 *
 * Two boundaries keep this honest:
 *
 * - **Nothing is fetched.** An external URL is classified and left alone. A
 *   documentation build that made network requests would be slow, flaky, and
 *   would quietly tell every linked site when somebody ran it.
 * - **Only what is knowable is reported.** A link to `/guide` is checked
 *   against the route map; a link to `mailto:` or `ftp:` is somebody else's
 *   business and is not reported at all.
 *
 * Hidden documents are valid targets. `hidden` keeps a page out of the
 * navigation, not out of the site, and reporting links to one would punish an
 * author for using the feature as intended.
 */

export const linkCodes = {
  unknownDocument: "link/unknown-document",
  unknownFragment: "link/unknown-fragment",
  missingAsset: "link/missing-asset",
} as const;

export type LinkKind =
  "external" | "mail" | "other-scheme" | "fragment" | "internal";

export interface ClassifiedLink {
  readonly kind: LinkKind;
  /** The path part, without query or fragment. Empty for a fragment-only link. */
  readonly path: string;
  /** The fragment, without `#`, when the link has one. */
  readonly fragment?: string;
}

const schemePattern = /^[a-z][a-z0-9+.-]*:/iu;

/**
 * Splits a URL into the parts validation cares about.
 *
 * A query string is preserved but never validated: it belongs to whatever
 * serves the target, and a documentation server has no opinion about it.
 */
export function classifyLink(url: string): ClassifiedLink {
  const trimmed = url.trim();

  if (trimmed.startsWith("//")) {
    // Protocol-relative, which is to say external.
    return { kind: "external", path: trimmed };
  }

  if (schemePattern.test(trimmed)) {
    const scheme = trimmed.slice(0, trimmed.indexOf(":")).toLowerCase();
    if (scheme === "http" || scheme === "https") {
      return { kind: "external", path: trimmed };
    }
    if (scheme === "mailto") {
      return { kind: "mail", path: trimmed };
    }
    return { kind: "other-scheme", path: trimmed };
  }

  const hash = trimmed.indexOf("#");
  const fragment = hash === -1 ? undefined : trimmed.slice(hash + 1);
  const withoutFragment = hash === -1 ? trimmed : trimmed.slice(0, hash);
  const query = withoutFragment.indexOf("?");
  const path = query === -1 ? withoutFragment : withoutFragment.slice(0, query);

  return {
    kind: path === "" ? "fragment" : "internal",
    path,
    ...(fragment === undefined || fragment === "" ? {} : { fragment }),
  };
}

/** Extensions that mean "this link points at a document, by its file name". */
const documentExtensions = new Set([".md", ".markdown", ".html", ".htm"]);

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

/**
 * Resolves a link's path against the document that contains it.
 *
 * Percent-encoding is decoded first, so `guide/a%20page` and `guide/a page`
 * are the same target — the same normalization routing applies, for the same
 * reason: a route is text, and comparing two spellings of it is how a valid
 * link is reported as broken.
 */
export function resolveLinkPath(
  from: SourcePath,
  path: string,
): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return undefined;
  }

  const fromDirectory = from.split("/").slice(0, -1);
  const segments = decoded.startsWith("/")
    ? decoded.slice(1).split("/")
    : [...fromDirectory, ...decoded.split("/")];

  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (resolved.pop() === undefined) {
        // Climbing past the documentation root. There is nothing above it, so
        // the link cannot resolve to anything Tsumugu serves.
        return undefined;
      }
      continue;
    }
    resolved.push(segment);
  }

  return resolved.join("/");
}

export interface LinkValidationTarget {
  /** Every route the project serves, including hidden documents. */
  readonly routes: ReadonlyMap<RoutePath, ReadonlySet<string>>;
  /** Whether a path inside the root is a file that would be served. */
  readonly hasAsset: (path: string) => boolean;
}

export interface DocumentLinks {
  readonly sourcePath: SourcePath;
  readonly links: readonly CollectedLink[];
  /** Identifiers in this document, for a fragment-only link. */
  readonly headingIds: ReadonlySet<string>;
}

function diagnostic(
  code: string,
  sourcePath: SourcePath,
  link: CollectedLink,
  message: string,
  hint: string,
): DocumentDiagnostic {
  // A warning, not an error: the page renders, and the reader can still read
  // everything except the one link.
  return {
    code,
    severity: "warning",
    stage: "links",
    message,
    hint,
    sourcePath,
    ...(link.range === undefined ? {} : { range: link.range }),
  };
}

/**
 * Validates one document's links against the project.
 *
 * Returns diagnostics for that document only, so an update can revalidate the
 * documents whose targets moved without touching the rest.
 */
export function validateDocumentLinks(
  document: DocumentLinks,
  target: LinkValidationTarget,
): readonly DocumentDiagnostic[] {
  const diagnostics: DocumentDiagnostic[] = [];

  for (const link of document.links) {
    const classified = classifyLink(link.url);

    if (
      classified.kind === "external" ||
      classified.kind === "mail" ||
      classified.kind === "other-scheme"
    ) {
      continue;
    }

    if (classified.kind === "fragment") {
      if (
        classified.fragment !== undefined &&
        !document.headingIds.has(classified.fragment)
      ) {
        diagnostics.push(
          diagnostic(
            linkCodes.unknownFragment,
            document.sourcePath,
            link,
            `This page has no section with the identifier "${classified.fragment}".`,
            "Identifiers come from heading text. Check the heading this link is meant to reach.",
          ),
        );
      }
      continue;
    }

    const resolved = resolveLinkPath(document.sourcePath, classified.path);
    if (resolved === undefined) {
      diagnostics.push(
        diagnostic(
          linkCodes.unknownDocument,
          document.sourcePath,
          link,
          `"${link.url}" points above the documentation root, so this server cannot serve it.`,
          "The link still works where the file is read as part of the repository. Move the target inside the root, or link to it by URL, to make it work in both places.",
        ),
      );
      continue;
    }

    const extension = extensionOf(resolved);

    // A link written to a file name is a link to that document. Authors write
    // `./setup.md` because that is what opens in their editor, and rejecting it
    // would make correct-looking documentation wrong.
    if (documentExtensions.has(extension)) {
      const route = routeForSource(resolved as SourcePath);
      if (route.ok && target.routes.has(route.route)) {
        diagnostics.push(
          ...fragmentDiagnostics(
            document.sourcePath,
            link,
            classified,
            route.route,
            target,
          ),
        );
        continue;
      }
      diagnostics.push(missingDocument(link, document.sourcePath));
      continue;
    }

    if (extension !== "" && !documentExtensions.has(extension)) {
      // Anything else with an extension is a file next to the documents.
      if (!target.hasAsset(resolved)) {
        diagnostics.push(
          diagnostic(
            linkCodes.missingAsset,
            document.sourcePath,
            link,
            `No file is served at "${link.url}".`,
            "Check the path, and that the file is inside the documentation root.",
          ),
        );
      }
      continue;
    }

    const candidate = toRoutePath(`/${resolved}`);
    if (candidate.ok && target.routes.has(candidate.value)) {
      diagnostics.push(
        ...fragmentDiagnostics(
          document.sourcePath,
          link,
          classified,
          candidate.value,
          target,
        ),
      );
      continue;
    }

    // A route with no extension may still be a file whose name has none.
    if (target.hasAsset(resolved)) {
      continue;
    }

    diagnostics.push(missingDocument(link, document.sourcePath));
  }

  return diagnostics;
}

/** Checks a link's fragment against the document it actually reaches. */
function fragmentDiagnostics(
  sourcePath: SourcePath,
  link: CollectedLink,
  classified: ClassifiedLink,
  route: RoutePath,
  target: LinkValidationTarget,
): readonly DocumentDiagnostic[] {
  const identifiers = target.routes.get(route);

  if (
    classified.fragment === undefined ||
    identifiers === undefined ||
    identifiers.has(classified.fragment)
  ) {
    return [];
  }

  return [
    diagnostic(
      linkCodes.unknownFragment,
      sourcePath,
      link,
      `"${route}" has no section with the identifier "${classified.fragment}".`,
      "Identifiers come from heading text, so they change when a heading is reworded.",
    ),
  ];
}

function missingDocument(
  link: CollectedLink,
  sourcePath: SourcePath,
): DocumentDiagnostic {
  return diagnostic(
    linkCodes.unknownDocument,
    sourcePath,
    link,
    `No document is served at "${link.url}".`,
    "Check the path. Routes follow the file system, so moving or renaming a file changes its link.",
  );
}
