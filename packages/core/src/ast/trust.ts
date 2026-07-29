import type { DocumentNode, SemanticNode } from "./nodes.js";

/**
 * Applies the operator's `--trust` declaration to a document (ADR 7).
 *
 * Renderers only ever produce untrusted raw markup; whether any of it may
 * reach the page verbatim is not their decision. This is the one place that
 * decision is applied: every preserved `raw-html` node is marked trusted, and
 * nothing else in the tree changes. Keeping the elevation in a single pass
 * means the declaration's scope is exactly this function, and a review of what
 * `--trust` covers is a review of it.
 */
export function trustRawHtml(root: DocumentNode): DocumentNode {
  return trustNode(root);
}

function trustNode<Node extends SemanticNode>(node: Node): Node {
  const elevated =
    node.type === "raw-html" && node.trust === "untrusted"
      ? { ...node, trust: "trusted" as const }
      : node;

  if (!("children" in elevated)) {
    return elevated;
  }

  return {
    ...elevated,
    children: elevated.children.map((child) => trustNode(child)),
  };
}
