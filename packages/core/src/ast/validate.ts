import type { SemanticNode } from "./nodes.js";
import { childrenOf, visit } from "./traverse.js";

/**
 * Structural invariants the type system cannot express.
 *
 * TypeScript keeps a paragraph from containing a paragraph, but it cannot say
 * that a heading depth is between 1 and 6, that every row of a table has the
 * same number of cells, or that a renderer did not hand back an object it
 * assembled at runtime from untyped parser output. Those are the mistakes a
 * renderer actually makes, and they surface far from their cause: a malformed
 * tree becomes a confusing theme failure three stages later.
 *
 * This is a development and test aid. It is not a security boundary — the
 * safety of preserved raw markup is decided by the serializer, not here.
 */

export interface NodeProblem {
  /** Path from the root, as node types, e.g. `document > list > list-item`. */
  readonly path: string;
  readonly message: string;
}

function describe(
  ancestors: readonly SemanticNode[],
  node: SemanticNode,
): string {
  return [...ancestors]
    .reverse()
    .concat(node)
    .map((entry) => entry.type)
    .join(" > ");
}

/**
 * Returns everything structurally wrong with a tree, in document order.
 *
 * All problems are collected rather than throwing on the first, because a
 * renderer that produces one malformed node usually produces several, and
 * fixing them one exception at a time is slow.
 */
export function findNodeProblems(root: SemanticNode): NodeProblem[] {
  const problems: NodeProblem[] = [];

  visit(root, (node, ancestors) => {
    const at = (message: string): void => {
      problems.push({ path: describe(ancestors, node), message });
    };

    switch (node.type) {
      case "heading":
        if (!Number.isInteger(node.depth) || node.depth < 1 || node.depth > 6) {
          at(
            `Heading depth must be an integer from 1 to 6, got ${node.depth}.`,
          );
        }
        break;

      case "list":
        if (node.start !== undefined && !node.ordered) {
          at("An unordered list cannot have a start number.");
        }
        if (node.start !== undefined && !Number.isInteger(node.start)) {
          at(`List start must be an integer, got ${node.start}.`);
        }
        break;

      case "table": {
        const columns = node.align.length;
        for (const row of node.children) {
          if (row.children.length !== columns) {
            at(
              `Table declares ${columns} column(s) but a row has ${row.children.length}. Rows and alignment must agree, or a cell has no column to belong to.`,
            );
            break;
          }
        }
        break;
      }

      case "image":
        // Empty is allowed and meaningful: it marks the image decorative.
        // Missing is not, and only a runtime check can tell them apart.
        if (typeof node.alt !== "string") {
          at(
            "An image must have alternative text. Use an empty string to mark it decorative.",
          );
        }
        break;

      case "link":
        if (node.url === "") {
          at("A link must have a destination.");
        }
        break;

      default:
        break;
    }

    // A node assembled from untyped parser output can be missing the field its
    // type promises. Checking here catches it at the boundary rather than at
    // whichever consumer dereferences it first.
    if (hasChildrenField(node) && !Array.isArray(childrenOf(node))) {
      at("Expected children to be an array.");
    }

    return "continue";
  });

  return problems;
}

function hasChildrenField(node: SemanticNode): boolean {
  return "children" in node;
}

/** Whether a tree satisfies every structural invariant. */
export function isValidNode(root: SemanticNode): boolean {
  return findNodeProblems(root).length === 0;
}
