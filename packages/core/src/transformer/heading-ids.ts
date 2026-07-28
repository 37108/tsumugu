import type { HeadingNode, SemanticNode } from "../ast/nodes.js";
import { textContent } from "../ast/traverse.js";

import type { Transformer } from "./contract.js";

/**
 * Heading identifiers.
 *
 * An anchor is a promise. Someone links to `/guide/setup#installing-the-cli`
 * from a chat message, a bug report or another site, and that link has to keep
 * working — so the identifier cannot depend on rendering order, on the theme,
 * or on which machine produced the page. It is derived here, once, from the
 * heading's own text, and everything downstream — the table of contents, link
 * validation, search results — reads the result instead of deriving its own.
 *
 * The algorithm, in full:
 *
 * 1. Take the heading's text content, ignoring emphasis, links and code marks.
 * 2. Normalize to Unicode NFKC, so text that looks identical compares
 *    identically regardless of how the author's editor encoded it.
 * 3. Lowercase it.
 * 4. Replace every run of whitespace with a single hyphen.
 * 5. Remove everything that is not a letter, a number, a combining mark or a
 *    hyphen. Emoji, punctuation and symbols go.
 * 6. Collapse repeated hyphens and trim them from both ends.
 * 7. If nothing is left, use `section`.
 * 8. If the result is already taken in this document, append `-2`, then `-3`,
 *    and so on in document order.
 *
 * Letters outside ASCII are **kept**, not transliterated. `## 日本語` becomes
 * `#日本語`, which is what the author wrote and what a reader searching the page
 * will recognise; guessing a Latin spelling for every script is a bigger
 * promise than a documentation server can keep.
 *
 * The algorithm is deliberately not compatible with any other generator's, and
 * changing it changes every existing link, so it is treated as a compatibility
 * surface: it may change only in a release that says so.
 */

/** Punctuation, symbols, emoji: anything not kept by rule 5. */
const disallowed = /[^\p{L}\p{N}\p{M}-]+/gu;
const whitespace = /\s+/gu;

/** Used when a heading has no characters an identifier can be built from. */
export const fallbackHeadingId = "section";

/** Turns heading text into an identifier, before duplicates are resolved. */
export function slugifyHeading(headingText: string): string {
  const slug = headingText
    .normalize("NFKC")
    .toLowerCase()
    .replace(whitespace, "-")
    .replace(disallowed, "")
    .replace(/-{2,}/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return slug === "" ? fallbackHeadingId : slug;
}

/**
 * An identifier a source document stated for itself, such as `<h2 id="install">`.
 *
 * Kept when it is usable, because an author who wrote one is describing a link
 * they expect to keep working. It is trimmed and checked for the characters
 * that would break a URL fragment; anything else is left exactly as written,
 * including case, because an explicit identifier is a name rather than a
 * derived slug.
 */
function usableExplicitId(id: string | undefined): string | undefined {
  if (id === undefined) {
    return undefined;
  }
  const trimmed = id.trim();
  if (trimmed === "" || /[\s#/?%]/u.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

/** Makes `candidate` unique within `taken`, recording the result. */
function unique(candidate: string, taken: Set<string>): string {
  if (!taken.has(candidate)) {
    taken.add(candidate);
    return candidate;
  }

  // Counting from 2 reads as "the second one", which is how a person refers to
  // a repeated heading.
  for (let suffix = 2; ; suffix += 1) {
    const attempt = `${candidate}-${String(suffix)}`;
    if (!taken.has(attempt)) {
      taken.add(attempt);
      return attempt;
    }
  }
}

/** Rebuilds a subtree with `assign` applied to every heading it contains. */
function withHeadingIds<T extends SemanticNode>(
  node: T,
  assign: (heading: HeadingNode) => HeadingNode,
): T {
  if (node.type === "heading") {
    return assign(node) as T;
  }
  if (!("children" in node)) {
    return node;
  }

  const children = node.children.map((child) => withHeadingIds(child, assign));
  // Sharing the original when nothing changed keeps an unchanged document
  // identical by reference, which is what makes a later cache comparison cheap.
  const changed = children.some(
    (child, index) => child !== node.children[index],
  );
  return changed ? { ...node, children } : node;
}

export const headingIdTransformerId = "tsumugu:heading-ids";

/**
 * The transformer that resolves every heading's identifier.
 *
 * It is registered by the composition root rather than built into the pipeline,
 * because core composes what it is handed. A project that wants different
 * anchors registers a different transformer; a project that wants none
 * registers none, and its pages simply have no in-page links.
 */
export function createHeadingIdTransformer(): Transformer {
  return {
    id: headingIdTransformerId,
    transform: (root, context) => {
      const taken = new Set<string>();

      return withHeadingIds(root, (heading) => {
        const explicit = usableExplicitId(heading.id);

        if (heading.id !== undefined && explicit === undefined) {
          context.report({
            code: "transformer/invalid-heading-id",
            severity: "warning",
            stage: "transformer",
            message: `The identifier "${heading.id}" cannot be used in a URL fragment.`,
            hint: "An identifier written in the source must not be empty or contain whitespace, #, /, ? or %. One derived from the heading text is used instead.",
            sourcePath: context.sourcePath,
            ...(heading.range === undefined ? {} : { range: heading.range }),
          });
        }

        const candidate = explicit ?? slugifyHeading(textContent(heading));
        const id = unique(candidate, taken);

        if (explicit !== undefined && id !== explicit) {
          // Two headings claiming one identifier is not something to resolve
          // silently: one of the two links the author expected now goes
          // somewhere else, and only they can decide which.
          context.report({
            code: "transformer/duplicate-heading-id",
            severity: "warning",
            stage: "transformer",
            message: `More than one heading claims the identifier "${explicit}".`,
            hint: `This one was given "${id}" instead, so both headings stay reachable.`,
            sourcePath: context.sourcePath,
            ...(heading.range === undefined ? {} : { range: heading.range }),
          });
        }

        return heading.id === id ? heading : { ...heading, id };
      });
    },
  };
}
