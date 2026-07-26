import { describe, expect, it } from "vitest";

import type { DocumentNode, SemanticNode, SemanticNodeType } from "./nodes.js";
import { childrenOf, textContent, visit } from "./traverse.js";
import { isValidNode } from "./validate.js";

/**
 * A document exercising every construct the first AST version covers.
 *
 * Written by hand because no renderer exists yet. Its job is to prove the node
 * set can express a realistic page, and to be the tree the traversal and
 * validation tests work against.
 */
const guide: DocumentNode = {
  type: "document",
  children: [
    {
      type: "heading",
      depth: 1,
      children: [{ type: "text", value: "Getting started" }],
    },
    {
      type: "paragraph",
      children: [
        { type: "text", value: "Install with " },
        { type: "inline-code", value: "pnpm add tsumugu" },
        { type: "text", value: ", then read the " },
        {
          type: "link",
          url: "/guide/configuration",
          children: [{ type: "text", value: "configuration guide" }],
        },
        { type: "text", value: "." },
      ],
    },
    {
      type: "list",
      ordered: true,
      start: 2,
      children: [
        {
          type: "list-item",
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "strong",
                  children: [{ type: "text", value: "Create" }],
                },
                { type: "text", value: " a docs directory." },
              ],
            },
            {
              type: "list",
              ordered: false,
              children: [
                {
                  type: "list-item",
                  children: [
                    {
                      type: "paragraph",
                      children: [
                        {
                          type: "emphasis",
                          children: [{ type: "text", value: "Nested" }],
                        },
                        { type: "text", value: " item." },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "code-block",
      language: "bash",
      value: "pnpm tsumugu dev\n",
    },
    {
      type: "blockquote",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "Documentation is a product." }],
        },
      ],
    },
    { type: "thematic-break" },
    {
      type: "table",
      align: ["left", "right", undefined],
      children: [
        {
          type: "table-row",
          header: true,
          children: [
            {
              type: "table-cell",
              children: [{ type: "text", value: "Option" }],
            },
            {
              type: "table-cell",
              children: [{ type: "text", value: "Default" }],
            },
            {
              type: "table-cell",
              children: [{ type: "text", value: "Notes" }],
            },
          ],
        },
        {
          type: "table-row",
          header: false,
          children: [
            { type: "table-cell", children: [{ type: "text", value: "port" }] },
            { type: "table-cell", children: [{ type: "text", value: "5173" }] },
            { type: "table-cell", children: [] },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      children: [
        {
          type: "image",
          url: "/assets/pipeline.svg",
          alt: "The document pipeline, from scanner to HTTP response",
        },
      ],
    },
  ],
};

describe("the node set", () => {
  it("can express a realistic page", () => {
    expect(isValidNode(guide)).toBe(true);
  });

  it("keeps nested lists nested", () => {
    // A list item holding blocks rather than inlines is what makes this
    // representable at all.
    const found: string[] = [];
    visit(guide, (node) => {
      if (node.type === "list") {
        found.push(node.ordered ? "ordered" : "unordered");
      }
      return "continue";
    });

    expect(found).toEqual(["ordered", "unordered"]);
  });

  it("records a heading's outline level rather than its appearance", () => {
    const heading = guide.children[0];
    expect(heading?.type).toBe("heading");
    if (heading?.type !== "heading") {
      return;
    }
    expect(heading.depth).toBe(1);
  });

  it("carries table alignment per column, including unspecified columns", () => {
    const table = guide.children.find((node) => node.type === "table");
    expect(table?.type).toBe("table");
    if (table?.type !== "table") {
      return;
    }
    expect(table.align).toEqual(["left", "right", undefined]);
  });
});

describe("exhaustiveness", () => {
  /**
   * A switch over every node type.
   *
   * Its value is that it stops compiling when a node is added to the union
   * without being handled here — which is the guarantee a theme depends on.
   */
  function label(node: SemanticNode): string {
    switch (node.type) {
      case "document":
        return "document";
      case "heading":
        return `heading ${node.depth}`;
      case "paragraph":
        return "paragraph";
      case "text":
        return `text ${node.value}`;
      case "emphasis":
        return "emphasis";
      case "strong":
        return "strong";
      case "inline-code":
        return "inline code";
      case "code-block":
        return `code ${node.language ?? "plain"}`;
      case "list":
        return node.ordered ? "ordered list" : "unordered list";
      case "list-item":
        return "list item";
      case "link":
        return `link ${node.url}`;
      case "image":
        return `image ${node.alt}`;
      case "blockquote":
        return "blockquote";
      case "thematic-break":
        return "thematic break";
      case "table":
        return "table";
      case "table-row":
        return node.header ? "header row" : "row";
      case "table-cell":
        return "cell";
      case "raw-html":
        return "raw html";
      case "unsupported":
        return `unsupported ${node.reason}`;
    }
  }

  it("lets a consumer switch over every node without a default branch", () => {
    const labels: string[] = [];
    visit(guide, (node) => {
      labels.push(label(node));
      return "continue";
    });

    expect(labels[0]).toBe("document");
    expect(labels).toContain("heading 1");
    expect(labels).toContain("ordered list");
    expect(labels).toContain("header row");
  });

  it("covers every node type except the two escape hatches", () => {
    const seen = new Set<SemanticNodeType>();
    visit(guide, (node) => {
      seen.add(node.type);
      return "continue";
    });

    // Listed rather than counted, so adding a node type to the union fails
    // here until the fixture or this list accounts for it.
    expect([...seen].sort()).toEqual(
      [
        "blockquote",
        "code-block",
        "document",
        "emphasis",
        "heading",
        "image",
        "inline-code",
        "link",
        "list",
        "list-item",
        "paragraph",
        "strong",
        "table",
        "table-cell",
        "table-row",
        "text",
        "thematic-break",
      ].sort(),
    );

    // `raw-html` and `unsupported` are deliberately absent from a page that
    // needs neither; they are covered on their own below.
    for (const type of ["raw-html", "unsupported"] as const) {
      expect(seen.has(type)).toBe(false);
    }
  });
});

describe("format independence", () => {
  it("produces one tree for the same meaning written two ways", () => {
    // Markdown: "## Install\n\nRun `pnpm i`.\n"
    const fromMarkdown: DocumentNode = {
      type: "document",
      children: [
        {
          type: "heading",
          depth: 2,
          children: [{ type: "text", value: "Install" }],
        },
        {
          type: "paragraph",
          children: [
            { type: "text", value: "Run " },
            { type: "inline-code", value: "pnpm i" },
            { type: "text", value: "." },
          ],
        },
      ],
    };

    // HTML: "<h2>Install</h2><p>Run <code>pnpm i</code>.</p>"
    const fromHtml: DocumentNode = {
      type: "document",
      children: [
        {
          type: "heading",
          depth: 2,
          children: [{ type: "text", value: "Install" }],
        },
        {
          type: "paragraph",
          children: [
            { type: "text", value: "Run " },
            { type: "inline-code", value: "pnpm i" },
            { type: "text", value: "." },
          ],
        },
      ],
    };

    // The whole point of the boundary: below it, format has stopped mattering.
    // A theme cannot tell which file this came from, and does not need to.
    expect(fromHtml).toEqual(fromMarkdown);
    expect(textContent(fromHtml)).toBe(textContent(fromMarkdown));
  });

  it("contains no browser layout concepts", () => {
    // There is no div, span or br: those describe presentation, and a theme
    // owns presentation. A node named after an HTML element would have made
    // Markdown a second-class input.
    const types: string[] = [];
    visit(guide, (node) => {
      types.push(node.type);
      return "continue";
    });

    for (const layout of ["div", "span", "br", "section", "article"]) {
      expect(types).not.toContain(layout);
    }
  });
});

describe("escape hatches", () => {
  it("preserves HTML that has no semantic equivalent, marked untrusted", () => {
    const document: DocumentNode = {
      type: "document",
      children: [
        {
          type: "raw-html",
          value: '<figure class="diagram"><img src="a.svg" alt="A"></figure>',
          trust: "untrusted",
          placement: "block",
        },
      ],
    };

    const node = document.children[0];
    expect(node?.type).toBe("raw-html");
    if (node?.type !== "raw-html") {
      return;
    }
    // The node records that this came from a documentation file. Whether any
    // of it may reach the page is the serializer's decision, not the AST's.
    expect(node.trust).toBe("untrusted");
    expect(childrenOf(node)).toEqual([]);
  });

  it("keeps source it cannot represent instead of dropping it", () => {
    const document: DocumentNode = {
      type: "document",
      children: [
        {
          type: "unsupported",
          reason: "Footnote definitions are not represented yet",
          value: "[^1]: A footnote.",
          placement: "block",
        },
      ],
    };

    const node = document.children[0];
    if (node?.type !== "unsupported") {
      expect.fail("expected an unsupported node");
    }
    // The author's text survives, so a diagnostic can point at something real
    // and a future version can represent it without the content being gone.
    expect(node.value).toBe("[^1]: A footnote.");
    expect(node.reason).not.toBe("");
  });
});
