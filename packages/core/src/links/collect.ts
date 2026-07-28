import type { DocumentNode, SourceRange } from "../ast/nodes.js";
import { visit } from "../ast/traverse.js";

/**
 * What a document points at.
 *
 * Collected once, when the document is parsed, and kept — so validating every
 * link in a project after an edit costs a walk over a few arrays rather than a
 * re-parse of every file. A link is a small thing to remember and an expensive
 * thing to rediscover.
 */

export interface CollectedLink {
  /** The URL exactly as the author wrote it. */
  readonly url: string;
  /** Where it is in the source, when the parser reported a position. */
  readonly range?: SourceRange;
  /** Whether it came from a link or from an image. */
  readonly kind: "link" | "image";
}

export interface CollectedReferences {
  readonly links: readonly CollectedLink[];
  /** Identifiers a link from elsewhere may target. */
  readonly headingIds: ReadonlySet<string>;
}

/**
 * Reads a document's outgoing links and its addressable headings.
 *
 * Run after the transformers, so heading identifiers are the resolved ones —
 * validating a fragment against an identifier that a later stage would change
 * would report problems that do not exist.
 */
export function collectReferences(root: DocumentNode): CollectedReferences {
  const links: CollectedLink[] = [];
  const headingIds = new Set<string>();

  visit(root, (node) => {
    if (node.type === "heading" && node.id !== undefined) {
      headingIds.add(node.id);
    }
    if (node.type === "link" || node.type === "image") {
      links.push({
        url: node.url,
        kind: node.type,
        ...(node.range === undefined ? {} : { range: node.range }),
      });
    }
    return "continue";
  });

  return { links, headingIds };
}
