import { describe, expect, it } from "vitest";

import type { DocumentNode, HeadingNode, SemanticNode } from "./nodes.js";
import { findNodeProblems, isValidNode } from "./validate.js";

function documentOf(...children: DocumentNode["children"]): DocumentNode {
  return { type: "document", children };
}

/**
 * Builds a node the type system would reject.
 *
 * A renderer assembles nodes from untyped parser output, so a value the union
 * forbids can still arrive at runtime — which is the whole reason
 * `findNodeProblems` exists. Constructing one needs an assertion, and it is
 * kept here rather than repeated at every call site.
 */
function malformed(value: object): SemanticNode {
  const node: unknown = value;
  return node as SemanticNode;
}

describe("findNodeProblems", () => {
  it("reports nothing for a well-formed tree", () => {
    expect(
      findNodeProblems(
        documentOf(
          {
            type: "heading",
            depth: 1,
            children: [{ type: "text", value: "A" }],
          },
          { type: "paragraph", children: [{ type: "text", value: "B" }] },
        ),
      ),
    ).toEqual([]);
  });

  it("names the path to the problem", () => {
    // A malformed node surfaces far from its cause, so the report has to say
    // where in the tree it is.
    const problems = findNodeProblems(
      documentOf({
        type: "blockquote",
        children: [
          {
            type: "paragraph",
            children: [{ type: "link", url: "", children: [] }],
          },
        ],
      }),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]?.path).toBe("document > blockquote > paragraph > link");
  });

  it("collects every problem rather than stopping at the first", () => {
    // A renderer that produces one malformed node usually produces several,
    // and fixing them one exception at a time is slow.
    const brokenQuote: DocumentNode["children"][number] = {
      type: "blockquote",
      children: [
        {
          type: "paragraph",
          children: [{ type: "link", url: "", children: [] }],
        },
      ],
    };

    expect(findNodeProblems(documentOf(brokenQuote, brokenQuote))).toHaveLength(
      2,
    );
  });
});

describe("heading depth", () => {
  it.each([1, 2, 3, 4, 5, 6])("accepts depth %i", (depth) => {
    const heading: HeadingNode = {
      type: "heading",
      depth: depth as HeadingNode["depth"],
      children: [],
    };
    expect(isValidNode(heading)).toBe(true);
  });

  it.each([0, 7, -1, 1.5, Number.NaN])("rejects depth %s", (depth) => {
    // Values the type forbids can still arrive from a renderer assembling
    // nodes out of untyped parser output.
    expect(
      findNodeProblems(malformed({ type: "heading", depth, children: [] }))[0]
        ?.message,
    ).toContain("1 to 6");
  });
});

describe("lists", () => {
  it("accepts an ordered list with a start number", () => {
    expect(
      isValidNode({ type: "list", ordered: true, start: 3, children: [] }),
    ).toBe(true);
  });

  it("rejects a start number on an unordered list", () => {
    const problems = findNodeProblems({
      type: "list",
      ordered: false,
      start: 3,
      children: [],
    });

    expect(problems[0]?.message).toContain("unordered list");
  });

  it("rejects a fractional start number", () => {
    const problems = findNodeProblems({
      type: "list",
      ordered: true,
      start: 1.5,
      children: [],
    });

    expect(problems[0]?.message).toContain("integer");
  });
});

describe("tables", () => {
  it("accepts rows matching the declared column count", () => {
    expect(
      isValidNode({
        type: "table",
        align: ["left", undefined],
        children: [
          {
            type: "table-row",
            header: true,
            children: [
              { type: "table-cell", children: [] },
              { type: "table-cell", children: [] },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects a row with the wrong number of cells", () => {
    // Otherwise a cell has no column, and the mismatch appears as a broken
    // layout in the theme rather than as a message about the document.
    const problems = findNodeProblems({
      type: "table",
      align: ["left", "right"],
      children: [
        {
          type: "table-row",
          header: true,
          children: [{ type: "table-cell", children: [] }],
        },
      ],
    });

    expect(problems[0]?.message).toContain("2 column(s) but a row has 1");
  });

  it("reports a table's mismatch once, not once per row", () => {
    const problems = findNodeProblems({
      type: "table",
      align: ["left"],
      children: [
        { type: "table-row", header: false, children: [] },
        { type: "table-row", header: false, children: [] },
      ],
    });

    expect(problems).toHaveLength(1);
  });
});

describe("images", () => {
  it("accepts empty alternative text as a decorative marker", () => {
    expect(isValidNode({ type: "image", url: "/a.png", alt: "" })).toBe(true);
  });

  it("rejects missing alternative text", () => {
    // The most common accessibility failure in generated documentation, and
    // the one thing here worth being strict about.
    expect(
      findNodeProblems(malformed({ type: "image", url: "/a.png" }))[0]?.message,
    ).toContain("alternative text");
  });
});

describe("links", () => {
  it("accepts any destination the author wrote", () => {
    // Resolving and rejecting URL schemes happens later. A node that dropped
    // the link here would hide it from the diagnostics that should report it.
    expect(
      isValidNode({ type: "link", url: "../other.md", children: [] }),
    ).toBe(true);
  });

  it("rejects an empty destination", () => {
    expect(
      findNodeProblems({ type: "link", url: "", children: [] })[0]?.message,
    ).toContain("destination");
  });
});
