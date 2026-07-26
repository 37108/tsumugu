import {
  element,
  fragment,
  renderUnsupported,
  text,
  type NodeRenderer,
  type RenderContext,
  type SemanticNode,
  type Theme,
  type VirtualNode,
} from "@tsumugu/core";

/**
 * The smallest theme that proves the contract.
 *
 * It exists so the vertical slice has something to render with, and it is
 * deliberately plain: no stylesheet, no layout, no opinions beyond correct
 * HTML. `@tsumugu/theme-default` replaces it, and when it does this file
 * should be deleted rather than grown.
 *
 * It lives in the CLI because the CLI is the composition root — the place that
 * decides which renderers and which theme a zero-config project gets. Core
 * composes what it is given and chooses nothing.
 */

function children(node: SemanticNode, context: RenderContext): VirtualNode[] {
  return "children" in node
    ? node.children.map((child) => context.renderChild(child))
    : [];
}

/** Renders a node's children inside `tag`. */
function wrap(
  tag: string,
  attributes: Record<string, string> = {},
): NodeRenderer {
  return (node, context) =>
    element(tag, attributes, ...children(node, context));
}

export const minimalTheme: Theme = {
  id: "minimal",

  renderers: {
    document: (node, context) => fragment(...children(node, context)),

    heading: (node, context) =>
      node.type === "heading"
        ? element(`h${String(node.depth)}`, {}, ...children(node, context))
        : fragment(),

    paragraph: wrap("p"),
    emphasis: wrap("em"),
    strong: wrap("strong"),
    blockquote: wrap("blockquote"),
    "list-item": wrap("li"),

    text: (node) => (node.type === "text" ? text(node.value) : fragment()),

    "inline-code": (node) =>
      node.type === "inline-code"
        ? element("code", {}, text(node.value))
        : fragment(),

    "code-block": (node) =>
      node.type === "code-block"
        ? element(
            "pre",
            {},
            element(
              "code",
              // The language is exposed as data rather than as a class, because
              // no stylesheet exists to give a class meaning yet.
              node.language === undefined
                ? {}
                : { "data-language": node.language },
              text(node.value),
            ),
          )
        : fragment(),

    "thematic-break": () => element("hr"),

    list: (node, context) =>
      node.type === "list"
        ? element(
            node.ordered ? "ol" : "ul",
            node.start === undefined ? {} : { start: String(node.start) },
            ...children(node, context),
          )
        : fragment(),

    link: (node, context) =>
      node.type === "link"
        ? element("a", { href: node.url }, ...children(node, context))
        : fragment(),

    image: (node) =>
      node.type === "image"
        ? element("img", { src: node.url, alt: node.alt })
        : fragment(),

    table: (node, context) => element("table", {}, ...children(node, context)),

    // A cell renderer cannot know whether it sits in a header row: the render
    // context deliberately exposes no parent. The row knows, so the row builds
    // its own cells - which is the contract working as designed rather than a
    // gap in it. `th` is what lets a screen reader announce the column a value
    // belongs to, so getting this right is not cosmetic.
    "table-row": (node, context) =>
      node.type === "table-row"
        ? element(
            "tr",
            {},
            ...node.children.map((cell) =>
              element(
                node.header ? "th" : "td",
                node.header ? { scope: "col" } : {},
                ...cell.children.map((child) => context.renderChild(child)),
              ),
            ),
          )
        : fragment(),

    // Reached only if a cell is rendered outside a row, which the AST does not
    // produce. Present so the node type has a renderer rather than a warning.
    "table-cell": wrap("td"),

    // Preserved markup is untrusted documentation content. Showing it as text
    // is the only safe thing a theme with no sanitizer can do; the alternative
    // is emitting somebody else's markup into the page.
    "raw-html": (node) =>
      node.type === "raw-html"
        ? element("pre", { "data-tsumugu-raw-html": "true" }, text(node.value))
        : fragment(),

    unsupported: renderUnsupported,
  },
};
