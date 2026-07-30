import {
  renderWithTheme,
  serializeToHtml,
  type BlockNode,
  type InlineNode,
  type ResolvedMetadata,
  type SourcePath,
} from "tsumugu-core";
import { describe, expect, it } from "vitest";

import { defaultTheme } from "./index.js";

const metadata: ResolvedMetadata = {
  title: "A page",
  titleSource: "heading",
  hidden: false,
  diagnostics: [],
};

/** Renders one node the way the pipeline would, and returns the HTML. */
function render(node: BlockNode | InlineNode): {
  readonly html: string;
  readonly codes: readonly string[];
} {
  const result = renderWithTheme(defaultTheme, {
    root: { type: "document", children: [node as BlockNode] },
    metadata,
    sourcePath: "guide.md" as SourcePath,
  });

  return {
    html: serializeToHtml(result.tree),
    codes: result.diagnostics.map((diagnostic) => diagnostic.code),
  };
}

function textNode(value: string): InlineNode {
  return { type: "text", value };
}

describe("the default theme", () => {
  it("renders every node type the AST defines", () => {
    // A missing renderer is reported rather than silently falling back, so
    // asserting on an empty diagnostic list is what proves coverage.
    const nodes: (BlockNode | InlineNode)[] = [
      { type: "heading", depth: 2, children: [textNode("Install")] },
      { type: "paragraph", children: [textNode("Text")] },
      { type: "blockquote", children: [] },
      { type: "code-block", value: "npm i", language: "sh" },
      { type: "thematic-break" },
      {
        type: "list",
        ordered: false,
        children: [{ type: "list-item", children: [] }],
      },
      { type: "link", url: "/guide", children: [textNode("Guide")] },
      { type: "image", url: "/a.png", alt: "A diagram" },
      {
        type: "table",
        align: [],
        children: [
          {
            type: "table-row",
            header: true,
            children: [{ type: "table-cell", children: [textNode("Name")] }],
          },
        ],
      },
      { type: "emphasis", children: [textNode("x")] },
      { type: "strong", children: [textNode("x")] },
      { type: "inline-code", value: "x" },
      {
        type: "raw-html",
        value: "<div>x</div>",
        trust: "untrusted",
        placement: "block",
      },
      {
        type: "unsupported",
        value: "??",
        reason: "no equivalent",
        placement: "block",
      },
    ];

    for (const node of nodes) {
      const { codes } = render(node);
      expect(
        codes.filter((code) => code === "theme/missing-renderer"),
        `no renderer for ${node.type}`,
      ).toEqual([]);
    }
  });

  it("keeps the heading level the document stated", () => {
    expect(
      render({ type: "heading", depth: 3, children: [textNode("Deep")] }).html,
    ).toBe("<h3>Deep</h3>");
  });

  it("adds a permalink named after the section it links to", () => {
    const { html } = render({
      type: "heading",
      depth: 2,
      id: "install",
      children: [textNode("Install the CLI")],
    });

    expect(html).toContain('id="install"');
    expect(html).toContain('href="#install"');
    // Named, because "hash, link" repeated down a page tells a screen reader
    // user nothing about where any of them go.
    expect(html).toContain('aria-label="Link to Install the CLI"');
  });

  it("adds no permalink when no transformer resolved an identifier", () => {
    const { html } = render({
      type: "heading",
      depth: 2,
      children: [textNode("Install")],
    });

    expect(html).toBe("<h2>Install</h2>");
  });

  it("renders task list markers as disabled checkboxes", () => {
    const { html } = render({
      type: "list",
      ordered: false,
      children: [
        {
          type: "list-item",
          checked: true,
          children: [
            { type: "paragraph", children: [textNode("Already done")] },
          ],
        },
      ],
    });

    expect(html).toContain('class="tsumugu-task-item"');
    expect(html).toContain('<input checked disabled type="checkbox">');
    expect(html).not.toContain("[x]");
  });

  it("makes a code block scrollable by keyboard", () => {
    const { html } = render({
      type: "code-block",
      value: "a very long line",
      language: "ts",
    });

    expect(html).toBe(
      '<pre tabindex="0"><code data-language="ts">a very long line</code></pre>',
    );
  });

  it("puts a table in a named, focusable scroll region", () => {
    const { html } = render({
      type: "table",
      align: [],
      children: [
        {
          type: "table-row",
          header: true,
          children: [{ type: "table-cell", children: [textNode("Name")] }],
        },
      ],
    });

    // A grouping rather than a landmark: two tables on one page would put two
    // entries called "Table" in a screen reader's landmark list.
    expect(html).toContain('role="group"');
    expect(html).not.toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Table"');
  });

  it("announces a header cell as the column it heads", () => {
    const { html } = render({
      type: "table",
      align: [],
      children: [
        {
          type: "table-row",
          header: true,
          children: [{ type: "table-cell", children: [textNode("Name")] }],
        },
        {
          type: "table-row",
          header: false,
          children: [{ type: "table-cell", children: [textNode("Tsumugu")] }],
        },
      ],
    });

    expect(html).toContain('<th scope="col">Name</th>');
    expect(html).toContain("<td>Tsumugu</td>");
  });

  it("keeps an image's alternative text and lets it load lazily", () => {
    const { html } = render({
      type: "image",
      url: "/diagram.png",
      alt: "The pipeline, stage by stage",
    });

    expect(html).toBe(
      '<img alt="The pipeline, stage by stage" decoding="async" loading="lazy" src="/diagram.png">',
    );
  });

  it("shows preserved markup as text rather than emitting it", () => {
    const { html } = render({
      type: "raw-html",
      value: '<img src=x onerror="alert(1)">',
      trust: "untrusted",
      placement: "block",
    });

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("emits preserved markup verbatim once the operator has trusted it", () => {
    const { html } = render({
      type: "raw-html",
      value: '<canvas id="chart"></canvas>',
      trust: "trusted",
      placement: "block",
    });

    expect(html).toContain('<canvas id="chart"></canvas>');
    expect(html).not.toContain("&lt;canvas");
  });

  it("escapes text that looks like markup", () => {
    expect(render(textNode("<script>alert(1)</script>")).html).not.toContain(
      "<script",
    );
  });

  it("ships a stylesheet that needs nothing from the network", () => {
    const stylesheet = defaultTheme.stylesheet ?? "";

    expect(stylesheet).toContain(".tsumugu-doc");
    expect(stylesheet).not.toContain("@import");
    expect(stylesheet).not.toContain("url(");
  });

  it("answers the reader's dark-mode preference without asking again", () => {
    const stylesheet = defaultTheme.stylesheet ?? "";

    expect(stylesheet).toContain("@media (prefers-color-scheme: dark)");
    // The tokens are redefined, rather than individual rules being repeated:
    // one palette in two directions, not two stylesheets.
    expect(stylesheet).toMatch(
      /@media \(prefers-color-scheme: dark\)[^}]*\{[^}]*--doc-ink:/u,
    );
  });

  it("styles only document content, leaving the page around it to the shell", () => {
    const selectors = (defaultTheme.stylesheet ?? "")
      .split("\n")
      .filter((line) => line.trimEnd().endsWith("{"))
      .map((line) => line.trim());

    for (const selector of selectors) {
      expect(
        selector.includes(".tsumugu-doc") ||
          selector.includes("prefers-color-scheme") ||
          selector.includes(".tsumugu-anchor") ||
          selector.includes(".tsumugu-table-scroll") ||
          selector.startsWith("@"),
        `"${selector}" reaches outside the document content the theme owns`,
      ).toBe(true);
    }
  });
});
