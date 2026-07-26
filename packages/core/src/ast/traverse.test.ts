import { describe, expect, it } from "vitest";

import type { DocumentNode, SemanticNode } from "./nodes.js";
import { childrenOf, textContent, visit } from "./traverse.js";

const document: DocumentNode = {
  type: "document",
  children: [
    {
      type: "heading",
      depth: 2,
      children: [
        { type: "text", value: "Set " },
        { type: "inline-code", value: "port" },
      ],
    },
    {
      type: "paragraph",
      children: [
        { type: "text", value: "See " },
        {
          type: "link",
          url: "/guide",
          children: [
            {
              type: "emphasis",
              children: [{ type: "text", value: "the guide" }],
            },
          ],
        },
      ],
    },
  ],
};

describe("childrenOf", () => {
  it("returns the children of a container", () => {
    expect(childrenOf(document)).toHaveLength(2);
  });

  it.each([
    ["text", { type: "text", value: "a" }],
    ["inline-code", { type: "inline-code", value: "a" }],
    ["code-block", { type: "code-block", value: "a" }],
    ["thematic-break", { type: "thematic-break" }],
    ["image", { type: "image", url: "/a.png", alt: "A" }],
    [
      "raw-html",
      {
        type: "raw-html",
        value: "<b>",
        trust: "untrusted",
        placement: "inline",
      },
    ],
    [
      "unsupported",
      { type: "unsupported", reason: "r", value: "v", placement: "block" },
    ],
  ] as readonly (readonly [string, SemanticNode])[])(
    "returns nothing for the leaf %s",
    (_label, node) => {
      expect(childrenOf(node)).toEqual([]);
    },
  );
});

describe("visit", () => {
  it("walks depth-first in document order", () => {
    const order: string[] = [];
    visit(document, (node) => {
      order.push(node.type);
      return "continue";
    });

    // Document order is what a table of contents and a heading outline need.
    expect(order).toEqual([
      "document",
      "heading",
      "text",
      "inline-code",
      "paragraph",
      "text",
      "link",
      "emphasis",
      "text",
    ]);
  });

  it("passes ancestors nearest-first", () => {
    let seen: readonly string[] = [];
    visit(document, (node, ancestors) => {
      if (node.type === "emphasis") {
        seen = ancestors.map((ancestor) => ancestor.type);
      }
      return "continue";
    });

    expect(seen).toEqual(["link", "paragraph", "document"]);
  });

  it("gives the root no ancestors", () => {
    let rootAncestors: readonly SemanticNode[] | undefined;
    visit(document, (node, ancestors) => {
      rootAncestors ??= node === document ? ancestors : undefined;
      return "continue";
    });

    expect(rootAncestors).toEqual([]);
  });

  it("does not descend when the visitor skips", () => {
    const order: string[] = [];
    visit(document, (node) => {
      order.push(node.type);
      return node.type === "heading" ? "skip" : "continue";
    });

    expect(order).toEqual([
      "document",
      "heading",
      "paragraph",
      "text",
      "link",
      "emphasis",
      "text",
    ]);
  });

  it("treats a visitor returning nothing as continue", () => {
    let count = 0;
    visit(document, () => {
      count += 1;
    });

    expect(count).toBe(9);
  });

  it("visits a leaf root exactly once", () => {
    const leaf: SemanticNode = { type: "thematic-break" };
    const seen: SemanticNode[] = [];
    visit(leaf, (node) => {
      seen.push(node);
      return "continue";
    });

    expect(seen).toEqual([leaf]);
  });
});

describe("textContent", () => {
  it("joins the readable text of a subtree", () => {
    expect(textContent(document)).toBe("Set portSee the guide");
  });

  it("includes code, because code is readable content", () => {
    expect(textContent({ type: "inline-code", value: "pnpm i" })).toBe(
      "pnpm i",
    );
  });

  it("uses alternative text for an image", () => {
    // It is what a reader who cannot see the image receives, so it is the
    // image's contribution to the readable document.
    expect(
      textContent({ type: "image", url: "/a.png", alt: "A pipeline diagram" }),
    ).toBe("A pipeline diagram");
  });

  it("ignores preserved raw markup", () => {
    // Its text is untrusted and unparsed. Counting it would put markup into a
    // heading identifier or a search snippet.
    const heading: SemanticNode = {
      type: "heading",
      depth: 2,
      children: [
        { type: "text", value: "Title" },
        {
          type: "raw-html",
          value: "<script>alert(1)</script>",
          trust: "untrusted",
          placement: "inline",
        },
      ],
    };

    expect(textContent(heading)).toBe("Title");
  });

  it("returns an empty string for a node with no text", () => {
    expect(textContent({ type: "thematic-break" })).toBe("");
  });
});
