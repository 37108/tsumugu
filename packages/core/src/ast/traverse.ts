import type { SemanticNode } from "./nodes.js";

/**
 * Traversal that works on any node, without a framework and without knowing
 * which format produced the tree.
 */

/**
 * Fails at compile time if a node type is missing from a switch, and at runtime
 * if one arrives that the build does not know about.
 *
 * This is what makes adding a node to the union safe: every exhaustive switch
 * stops compiling until it has been handled.
 */
function unhandled(node: never): never {
  const seen: unknown = node;
  throw new Error(
    `Unhandled semantic node: ${JSON.stringify(seen)}. A node type was added to the union without updating every exhaustive switch.`,
  );
}

/**
 * The children of a node, or an empty list for a leaf.
 *
 * Centralised so that traversal, validation and any future transformer do not
 * each repeat the knowledge of which nodes have children.
 */
export function childrenOf(node: SemanticNode): readonly SemanticNode[] {
  switch (node.type) {
    case "document":
    case "blockquote":
    case "list":
    case "list-item":
    case "table":
    case "table-row":
    case "heading":
    case "paragraph":
    case "emphasis":
    case "strong":
    case "link":
    case "table-cell":
      return node.children;
    case "text":
    case "inline-code":
    case "code-block":
    case "image":
    case "thematic-break":
    case "raw-html":
    case "unsupported":
      return [];
    default:
      return unhandled(node);
  }
}

/** What a visitor may ask the traversal to do next. */
export type VisitSignal = "continue" | "skip";

/**
 * Walks a tree depth-first in document order.
 *
 * Document order is what a table of contents, a heading outline and a search
 * index all need, so it is the only order provided. Returning `"skip"` leaves a
 * node's children unvisited, which is how a caller avoids descending into, say,
 * preserved raw markup.
 *
 * Ancestors are passed nearest-first, because a visitor almost always asks
 * about its immediate parent.
 */
export function visit(
  root: SemanticNode,
  visitor: (
    node: SemanticNode,
    ancestors: readonly SemanticNode[],
  ) => VisitSignal | void,
): void {
  const walk = (
    node: SemanticNode,
    ancestors: readonly SemanticNode[],
  ): void => {
    if (visitor(node, ancestors) === "skip") {
      return;
    }
    const nextAncestors = [node, ...ancestors];
    for (const child of childrenOf(node)) {
      walk(child, nextAncestors);
    }
  };

  walk(root, []);
}

/**
 * The readable text of a subtree.
 *
 * Used for heading identifiers, table-of-contents entries and search extracts,
 * which is enough repetition to justify one implementation.
 *
 * Preserved raw markup contributes nothing. Its text is untrusted source that
 * has not been parsed, so treating it as readable content would put markup into
 * a heading identifier or a search snippet.
 */
export function textContent(node: SemanticNode): string {
  let text = "";

  visit(node, (current) => {
    switch (current.type) {
      case "text":
      case "inline-code":
      case "code-block":
        text += current.value;
        return "continue";
      case "image":
        // Alternative text is what a reader without the image receives, so it
        // is the image's contribution to readable content.
        text += current.alt;
        return "continue";
      case "raw-html":
        return "skip";
      default:
        return "continue";
    }
  });

  return text;
}
