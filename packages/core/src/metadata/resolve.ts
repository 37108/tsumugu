import type { DocumentNode } from "../ast/nodes.js";
import { textContent, visit } from "../ast/traverse.js";
import type { DocumentDiagnostic } from "../document/diagnostics.js";
import { metadataString, type DocumentMetadata } from "../document/metadata.js";
import type { SourcePath } from "../document/paths.js";

/**
 * Shared metadata resolution.
 *
 * Titles and descriptions drive navigation, the browser tab, generated
 * landing pages, search and the machine-readable exports. If each of those
 * worked out its own fallback, they would disagree — the sidebar would say one
 * thing and the page heading another, for reasons nobody could reconstruct.
 *
 * So the precedence lives here, once, and every output reads the result.
 *
 * Extraction is deliberately elsewhere: pulling front matter out of a Markdown
 * file and reading `<title>` out of an HTML document are format-specific and
 * belong to the renderers. This module takes what they found and decides what
 * it means.
 */

/** Where a resolved title came from. */
export type TitleSource =
  "front-matter" | "html-title" | "heading" | "file-name";

export interface ResolvedMetadata {
  readonly title: string;
  /**
   * Which rule produced the title.
   *
   * Kept because "why is this page called that?" is a question users ask, and
   * without provenance the only answer is to re-derive the precedence by hand.
   */
  readonly titleSource: TitleSource;
  readonly description?: string;
  /** Explicit ordering hint for navigation. Lower sorts first. */
  readonly order?: number;
  /**
   * Hidden from navigation.
   *
   * The route stays reachable. A hidden page is one the author does not want
   * listed, not one they want to 404 — making it unreachable would break every
   * link already pointing at it.
   */
  readonly hidden: boolean;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

/** What the renderers found, handed to the shared precedence rules. */
export interface MetadataSources {
  readonly sourcePath: SourcePath;
  /** Normalized front matter, or whatever the format's equivalent produced. */
  readonly metadata: DocumentMetadata;
  /** The `<title>` of a full HTML document, when the source had one. */
  readonly htmlTitle?: string;
  /** The parsed document, used to find the first level-one heading. */
  readonly root?: DocumentNode;
}

export const metadataCodes = {
  invalidTitle: "metadata/invalid-title",
  invalidDescription: "metadata/invalid-description",
  invalidOrder: "metadata/invalid-order",
  invalidHidden: "metadata/invalid-hidden",
  unknownKeyTypo: "metadata/unknown-key-typo",
} as const;

/**
 * The keys this version understands.
 *
 * Everything else stays in `document.metadata` untouched. An unknown key is
 * not an error — it is the author saying something Tsumugu has no feature for
 * yet — but it also never becomes configuration.
 */
export const knownMetadataKeys = [
  "title",
  "description",
  "order",
  "hidden",
] as const;

function invalid(
  code: string,
  sourcePath: SourcePath,
  message: string,
): DocumentDiagnostic {
  // Bad metadata is a warning, not an error: the page is still readable, and
  // refusing to serve it would punish a reader for an author's typo.
  return { code, severity: "warning", stage: "metadata", message, sourcePath };
}

function describeValue(value: unknown): string {
  return Array.isArray(value) ? "a list" : `a ${typeof value}`;
}

/** The first level-one heading's text, or `undefined`. */
function firstLevelOneHeading(root: DocumentNode): string | undefined {
  let found: string | undefined;

  visit(root, (node) => {
    if (found !== undefined) {
      return "skip";
    }
    if (node.type === "heading" && node.depth === 1) {
      const text = textContent(node).trim();
      if (text !== "") {
        found = text;
      }
      return "skip";
    }
    return "continue";
  });

  return found;
}

/**
 * A readable title derived from the file name.
 *
 * Separators become spaces and the first letter is capitalized, which is
 * enough to turn `getting-started.md` into `Getting started`.
 *
 * An `index` file takes its parent directory's name, because `docs/guide/`
 * displayed as "Index" tells a reader nothing.
 *
 * Numeric prefixes are **kept**. `01-install.md` becomes `01 install`, not
 * `Install`. The file system is the source of truth, and silently deciding
 * that part of a name the author typed is decoration is the behaviour
 * `docs/principles.md` warns against. An author who wants a different title
 * writes one in front matter, which costs them one line and costs nobody a
 * surprise.
 */
export function titleFromFileName(sourcePath: SourcePath): string {
  const segments = sourcePath.split("/");
  const fileName = segments[segments.length - 1] ?? "";
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");

  const base =
    withoutExtension.toLowerCase() === "index"
      ? (segments[segments.length - 2] ?? withoutExtension)
      : withoutExtension;

  const readable = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (readable === "") {
    return withoutExtension;
  }
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

function resolveTitle(
  sources: MetadataSources,
  diagnostics: DocumentDiagnostic[],
): { readonly title: string; readonly titleSource: TitleSource } {
  const raw = sources.metadata.values.get("title");

  if (raw !== undefined && typeof raw !== "string") {
    diagnostics.push(
      invalid(
        metadataCodes.invalidTitle,
        sources.sourcePath,
        `Front matter "title" must be text, but it is ${describeValue(raw)}. Falling back to the next available title.`,
      ),
    );
  }

  // metadataString rejects empty and whitespace-only values, so `title: ""`
  // does not suppress a perfectly good heading further down the chain.
  const fromFrontMatter = metadataString(sources.metadata, "title");
  if (fromFrontMatter !== undefined) {
    return { title: fromFrontMatter, titleSource: "front-matter" };
  }

  const fromHtml = sources.htmlTitle?.trim();
  if (fromHtml !== undefined && fromHtml !== "") {
    return { title: fromHtml, titleSource: "html-title" };
  }

  const fromHeading =
    sources.root === undefined ? undefined : firstLevelOneHeading(sources.root);
  if (fromHeading !== undefined) {
    return { title: fromHeading, titleSource: "heading" };
  }

  return {
    title: titleFromFileName(sources.sourcePath),
    titleSource: "file-name",
  };
}

function resolveOrder(
  sources: MetadataSources,
  diagnostics: DocumentDiagnostic[],
): number | undefined {
  const raw = sources.metadata.values.get("order");
  if (raw === undefined) {
    return undefined;
  }

  // Finite only. NaN and Infinity have no position in a sorted list, and a
  // string is a common mistake worth naming rather than coercing.
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    diagnostics.push(
      invalid(
        metadataCodes.invalidOrder,
        sources.sourcePath,
        `Front matter "order" must be a finite number, but it is ${describeValue(raw)}. This page will be ordered as if it had no "order".`,
      ),
    );
    return undefined;
  }

  return raw;
}

function resolveHidden(
  sources: MetadataSources,
  diagnostics: DocumentDiagnostic[],
): boolean {
  const raw = sources.metadata.values.get("hidden");
  if (raw === undefined) {
    return false;
  }

  if (typeof raw !== "boolean") {
    diagnostics.push(
      invalid(
        metadataCodes.invalidHidden,
        sources.sourcePath,
        `Front matter "hidden" must be true or false, but it is ${describeValue(raw)}. This page will stay visible; a value that is not a boolean is too easy to get backwards to guess at.`,
      ),
    );
    return false;
  }

  return raw;
}

function resolveDescription(
  sources: MetadataSources,
  diagnostics: DocumentDiagnostic[],
): string | undefined {
  const raw = sources.metadata.values.get("description");
  if (raw !== undefined && typeof raw !== "string") {
    diagnostics.push(
      invalid(
        metadataCodes.invalidDescription,
        sources.sourcePath,
        `Front matter "description" must be text, but it is ${describeValue(raw)}. It will be omitted.`,
      ),
    );
  }
  return metadataString(sources.metadata, "description");
}

/**
 * Applies the shared precedence rules.
 *
 * Title precedence, highest first: front matter, then an HTML `<title>`, then
 * the first level-one heading, then the file name. Every step is skipped when
 * it yields nothing usable, so an empty value never blocks a good one below it.
 *
 * Deterministic: the same inputs always produce the same result and the same
 * diagnostics.
 */
/**
 * Whether two keys differ by one slip of the fingers: a dropped, added or
 * changed letter, or two adjacent letters swapped — the four shapes a typo
 * actually takes.
 */
function isOneEditAway(candidate: string, known: string): boolean {
  // Adjacent transposition: "titel" for "title". Same length, identical
  // except for one swapped pair.
  if (candidate.length === known.length) {
    const mismatches: number[] = [];
    for (let index = 0; index < candidate.length; index += 1) {
      if (candidate[index] !== known[index]) {
        mismatches.push(index);
      }
    }
    if (
      mismatches.length === 2 &&
      mismatches[1] === (mismatches[0] ?? 0) + 1 &&
      candidate[mismatches[0] ?? 0] === known[mismatches[1] ?? 0] &&
      candidate[mismatches[1] ?? 0] === known[mismatches[0] ?? 0]
    ) {
      return true;
    }
  }

  if (Math.abs(candidate.length - known.length) > 1) {
    return false;
  }

  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < candidate.length && j < known.length) {
    if (candidate[i] === known[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) {
      return false;
    }
    if (candidate.length > known.length) {
      i += 1;
    } else if (candidate.length < known.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }

  return edits + (candidate.length - i) + (known.length - j) <= 1;
}

/**
 * Warns when an unknown key is one letter away from a known one.
 *
 * `hiden: true` publishes the page its author meant to hide, silently, and
 * that is the failure this exists to catch. A genuinely unknown key —
 * `audience`, `owner` — stays silent, as the preserved-keys policy promises:
 * distance is the evidence that the author was reaching for our word.
 */
function typoWarnings(
  sources: MetadataSources,
  diagnostics: DocumentDiagnostic[],
): void {
  for (const key of sources.metadata.values.keys()) {
    if ((knownMetadataKeys as readonly string[]).includes(key)) {
      continue;
    }

    const nearest = knownMetadataKeys.find((known) =>
      isOneEditAway(key, known),
    );
    if (nearest !== undefined) {
      diagnostics.push(
        invalid(
          metadataCodes.unknownKeyTypo,
          sources.sourcePath,
          `Front matter "${key}" is not a known key. Did you mean "${nearest}"?`,
        ),
      );
    }
  }
}

export function resolveMetadata(sources: MetadataSources): ResolvedMetadata {
  const diagnostics: DocumentDiagnostic[] = [];

  typoWarnings(sources, diagnostics);

  const { title, titleSource } = resolveTitle(sources, diagnostics);
  const description = resolveDescription(sources, diagnostics);
  const order = resolveOrder(sources, diagnostics);
  const hidden = resolveHidden(sources, diagnostics);

  return {
    title,
    titleSource,
    ...(description === undefined ? {} : { description }),
    ...(order === undefined ? {} : { order }),
    hidden,
    diagnostics,
  };
}

/**
 * Orders documents for navigation.
 *
 * An explicit `order` wins, lowest first. Pages without one follow, sorted by
 * title, so a project that never uses `order` still gets a stable, readable
 * list rather than file-system order.
 *
 * Titles are compared with a locale-independent comparison on purpose: the
 * order of a generated sidebar must not change with the machine's locale, or
 * two developers get different output from the same sources.
 */
export function compareForNavigation(
  a: ResolvedMetadata,
  b: ResolvedMetadata,
): number {
  if (a.order !== undefined && b.order !== undefined) {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
  } else if (a.order !== undefined) {
    return -1;
  } else if (b.order !== undefined) {
    return 1;
  }

  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}
