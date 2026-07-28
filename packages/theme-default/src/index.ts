import {
  element,
  fragment,
  renderUnsupported,
  text,
  type CodeLine,
  type NodeRenderer,
  type RenderContext,
  type SemanticNode,
  type Theme,
  type VirtualNode,
} from "tsumugu-core";

import { stylesheet } from "./stylesheet.js";

/**
 * The default theme.
 *
 * It answers one question — what does a heading, a list, a table look like —
 * and refuses every other. It does not know what a sidebar is, which route is
 * being served, or that an HTTP server exists. That boundary is what lets a
 * project replace the presentation of its documents without reimplementing the
 * documentation site around them.
 *
 * Two rules run through every renderer below:
 *
 * **Semantics first.** The element chosen is the one that means the right
 * thing, not the one that looks right. A quotation is a `blockquote` because
 * assistive technology announces it as one; the fact that it is indented is a
 * consequence, decided in the stylesheet.
 *
 * **Nothing is invented.** The theme adds no headings, no numbering, no "on
 * this page", no author's name. The only markup it adds beyond the document's
 * own is a permalink beside each heading and a scroll container around each
 * table, and both exist because without them part of the document is
 * unreachable — by a keyboard, or on a narrow screen.
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

/**
 * The text of a heading, for the permalink's accessible name.
 *
 * A link labelled only "#" is announced as "hash, link", which tells a screen
 * reader user nothing about where it goes — and a page of them is a page of
 * identical links. Naming the section makes each one distinct and useful.
 */
function headingText(node: SemanticNode): string {
  if (node.type === "text" || node.type === "inline-code") {
    return node.value;
  }
  if (node.type === "image") {
    return node.alt;
  }
  return "children" in node ? node.children.map(headingText).join("") : "";
}

/** Renders tokenized code, one span per token and one newline per line. */
function highlightedLines(lines: readonly CodeLine[]): VirtualNode[] {
  const rendered: VirtualNode[] = [];

  for (const [index, line] of lines.entries()) {
    if (index > 0) {
      // The newline is text rather than markup: `pre` keeps it, and a browser
      // copying the block copies exactly what the author wrote.
      rendered.push(text("\n"));
    }

    for (const token of line) {
      const style = [
        token.color === undefined ? "" : `--tsumugu-code:${token.color}`,
        token.darkColor === undefined
          ? ""
          : `--tsumugu-code-dark:${token.darkColor}`,
        token.fontStyle === undefined
          ? ""
          : token.fontStyle === "underline"
            ? "text-decoration:underline"
            : `font-style:${token.fontStyle === "bold" ? "normal;font-weight:600" : "italic"}`,
      ]
        .filter((part) => part !== "")
        .join(";");

      rendered.push(
        style === ""
          ? text(token.value)
          : element("span", { style }, text(token.value)),
      );
    }
  }

  return rendered;
}

export const defaultTheme: Theme = {
  id: "default",
  stylesheet,

  renderers: {
    document: (node, context) => fragment(...children(node, context)),

    /**
     * A heading, with a permalink when the document has resolved identifiers.
     *
     * The identifier comes from the heading-id transformer. A theme that
     * derived its own would produce anchors that changed when the presentation
     * changed, which is the opposite of what an anchor is for.
     */
    heading: (node, context) => {
      if (node.type !== "heading") {
        return fragment();
      }

      const tag = `h${String(node.depth)}`;
      const content = children(node, context);

      if (node.id === undefined) {
        return element(tag, {}, ...content);
      }

      const label = headingText(node).trim();

      return element(
        tag,
        { id: node.id },
        ...content,
        element(
          "a",
          {
            class: "tsumugu-anchor",
            href: `#${node.id}`,
            "aria-label":
              label === "" ? "Link to this section" : `Link to ${label}`,
          },
          text("#"),
        ),
      );
    },

    paragraph: wrap("p"),
    emphasis: wrap("em"),
    strong: wrap("strong"),
    blockquote: wrap("blockquote"),
    "list-item": (node, context) =>
      node.type === "list-item"
        ? element(
            "li",
            node.checked === undefined ? {} : { class: "tsumugu-task-item" },
            ...(node.checked === undefined
              ? []
              : [
                  element("input", {
                    type: "checkbox",
                    checked: node.checked,
                    disabled: true,
                  }),
                ]),
            ...children(node, context),
          )
        : fragment(),

    text: (node) => (node.type === "text" ? text(node.value) : fragment()),

    "inline-code": (node) =>
      node.type === "inline-code"
        ? element("code", {}, text(node.value))
        : fragment(),

    /**
     * A code block, focusable so its overflow can be scrolled without a mouse.
     *
     * When a highlighting transformer has annotated the block, each token
     * becomes a span carrying both colours as custom properties, and a media
     * query picks one. The token's text is escaped like any other text, so the
     * highlighter contributes colour and cannot contribute markup.
     *
     * With no annotation the same block renders as plain text. That is what
     * makes highlighting removable rather than assumed.
     */
    "code-block": (node) =>
      node.type === "code-block"
        ? element(
            "pre",
            { tabindex: "0" },
            element(
              "code",
              node.language === undefined
                ? {}
                : { "data-language": node.language },
              ...(node.highlighted === undefined
                ? [text(node.value)]
                : highlightedLines(node.highlighted)),
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

    /**
     * An image.
     *
     * `loading="lazy"` and `decoding="async"` cost nothing and keep a page of
     * screenshots from blocking the text around them.
     */
    image: (node) =>
      node.type === "image"
        ? element("img", {
            src: node.url,
            alt: node.alt,
            loading: "lazy",
            decoding: "async",
          })
        : fragment(),

    /**
     * A table, inside a scroll container a keyboard can reach.
     *
     * A wide table on a narrow screen has to scroll somewhere. Scrolling the
     * page sideways moves everything else too, so the table scrolls inside its
     * own region — and a scrollable region that cannot be focused is one a
     * keyboard user cannot scroll, which is why it takes a tabindex and a name.
     */
    table: (node, context) =>
      element(
        "div",
        {
          class: "tsumugu-table-scroll",
          role: "region",
          "aria-label": "Table",
          tabindex: "0",
        },
        element("table", {}, ...children(node, context)),
      ),

    /**
     * A row, which builds its own cells.
     *
     * A cell renderer cannot know whether it sits in a header row: the render
     * context deliberately exposes no parent. The row knows, so the row decides
     * — and `th` with a scope is what lets a screen reader announce the column
     * a value belongs to, which makes this correctness rather than styling.
     */
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

    /**
     * Preserved markup, shown as text.
     *
     * This is documentation content, which is not the same as trusted content:
     * a theme with no sanitizer that emitted it would be emitting somebody
     * else's markup into the page. Showing the source keeps the author's
     * content visible and keeps the decision safe.
     */
    "raw-html": (node) =>
      node.type === "raw-html"
        ? element("pre", { "data-tsumugu-raw-html": "true" }, text(node.value))
        : fragment(),

    unsupported: renderUnsupported,
  },
};

export { stylesheet as defaultThemeStylesheet };
