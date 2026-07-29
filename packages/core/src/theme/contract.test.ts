import { describe, expect, it } from "vitest";

import type { DocumentNode, SemanticNode } from "../ast/nodes.js";
import { toSourcePath, type SourcePath } from "../document/paths.js";
import type { ResolvedMetadata } from "../metadata/resolve.js";
import {
  renderUnsupported,
  renderWithTheme,
  themeCodes,
  type NodeRenderer,
  type Theme,
} from "./contract.js";
import { serializeToHtml } from "./serialize.js";
import { element, fragment, text } from "./virtual-tree.js";

function sourcePath(value: string): SourcePath {
  const result = toSourcePath(value);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

const metadata: ResolvedMetadata = {
  title: "A page",
  titleSource: "front-matter",
  hidden: false,
  diagnostics: [],
};

const path = sourcePath("docs/a.md");

function renderAll(): NodeRenderer {
  return (node, context) =>
    fragment(
      ...("children" in node
        ? node.children.map((child) => context.renderChild(child))
        : []),
    );
}

/** A theme covering the nodes a documentation page is actually made of. */
const minimalTheme: Theme = {
  id: "minimal",
  renderers: {
    document: renderAll(),
    paragraph: (node, context) =>
      element(
        "p",
        {},
        ...("children" in node
          ? node.children.map((child) => context.renderChild(child))
          : []),
      ),
    heading: (node, context) =>
      node.type === "heading"
        ? element(
            `h${node.depth}`,
            {},
            ...node.children.map((child) => context.renderChild(child)),
          )
        : fragment(),
    text: (node) => (node.type === "text" ? text(node.value) : fragment()),
    strong: (node, context) =>
      element(
        "strong",
        {},
        ...("children" in node
          ? node.children.map((child) => context.renderChild(child))
          : []),
      ),
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
              node.language === undefined
                ? {}
                : { "data-language": node.language },
              text(node.value),
            ),
          )
        : fragment(),
    link: (node, context) =>
      node.type === "link"
        ? element(
            "a",
            { href: node.url },
            ...node.children.map((child) => context.renderChild(child)),
          )
        : fragment(),
    image: (node) =>
      node.type === "image"
        ? element("img", { alt: node.alt, src: node.url })
        : fragment(),
    list: (node, context) =>
      node.type === "list"
        ? element(
            node.ordered ? "ol" : "ul",
            {},
            ...node.children.map((child) => context.renderChild(child)),
          )
        : fragment(),
    "list-item": (node, context) =>
      element(
        "li",
        {},
        ...("children" in node
          ? node.children.map((child) => context.renderChild(child))
          : []),
      ),
    table: (node, context) =>
      element(
        "table",
        {},
        ...("children" in node
          ? node.children.map((child) => context.renderChild(child))
          : []),
      ),
    "table-row": (node, context) =>
      element(
        "tr",
        {},
        ...("children" in node
          ? node.children.map((child) => context.renderChild(child))
          : []),
      ),
    "table-cell": (node, context) =>
      element(
        "td",
        {},
        ...("children" in node
          ? node.children.map((child) => context.renderChild(child))
          : []),
      ),
    unsupported: renderUnsupported,
  },
};

function render(root: SemanticNode, theme: Theme = minimalTheme) {
  return renderWithTheme(theme, { root, metadata, sourcePath: path });
}

describe("a theme turns semantic nodes into a virtual tree", () => {
  it("preserves the language of a semantic part through a theme", () => {
    const result = render({
      type: "paragraph",
      lang: "en",
      children: [{ type: "text", value: "Search" }],
    });

    expect(serializeToHtml(result.tree)).toBe('<p lang="en">Search</p>');
  });

  it.each([
    ["text", { type: "text", value: "Hello" } satisfies SemanticNode, "Hello"],
    [
      "a heading",
      {
        type: "heading",
        depth: 2,
        children: [{ type: "text", value: "Install" }],
      } satisfies SemanticNode,
      "<h2>Install</h2>",
    ],
    [
      "inline code",
      { type: "inline-code", value: "pnpm i" } satisfies SemanticNode,
      "<code>pnpm i</code>",
    ],
    [
      "a code block",
      {
        type: "code-block",
        language: "bash",
        value: "pnpm i\n",
      } satisfies SemanticNode,
      '<pre><code data-language="bash">pnpm i\n</code></pre>',
    ],
    [
      "a link",
      {
        type: "link",
        url: "/guide",
        children: [{ type: "text", value: "Guide" }],
      } satisfies SemanticNode,
      '<a href="/guide">Guide</a>',
    ],
    [
      "an image",
      { type: "image", url: "/a.png", alt: "A diagram" } satisfies SemanticNode,
      '<img alt="A diagram" src="/a.png">',
    ],
  ])("renders %s", (_label, node, expected) => {
    const result = render(node);

    expect(serializeToHtml(result.tree)).toBe(expected);
    expect(result.diagnostics).toEqual([]);
  });

  it("renders a nested list", () => {
    const list: SemanticNode = {
      type: "list",
      ordered: true,
      children: [
        {
          type: "list-item",
          children: [
            { type: "paragraph", children: [{ type: "text", value: "One" }] },
          ],
        },
      ],
    };

    expect(serializeToHtml(render(list).tree)).toBe(
      "<ol><li><p>One</p></li></ol>",
    );
  });

  it("renders a table", () => {
    const table: SemanticNode = {
      type: "table",
      align: [undefined],
      children: [
        {
          type: "table-row",
          header: true,
          children: [
            {
              type: "table-cell",
              children: [{ type: "text", value: "Option" }],
            },
          ],
        },
      ],
    };

    expect(serializeToHtml(render(table).tree)).toBe(
      "<table><tr><td>Option</td></tr></table>",
    );
  });

  it("escapes document text through the serializer, not the theme", () => {
    // A renderer returns a tree, never a string, which is what makes escaping
    // one boundary's job instead of every renderer's.
    const document: DocumentNode = {
      type: "document",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "<script>alert(1)</script>" }],
        },
      ],
    };

    const html = serializeToHtml(render(document).tree);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("missing renderers", () => {
  it("shows the content and reports the gap", () => {
    // Dropping the subtree would hide an author's writing because a theme has
    // a gap, which is the worse failure for a documentation tool.
    const sparse: Theme = {
      id: "sparse",
      renderers: {
        text: (node) => (node.type === "text" ? text(node.value) : fragment()),
      },
    };

    const result = renderWithTheme(sparse, {
      root: {
        type: "heading",
        depth: 1,
        children: [{ type: "text", value: "Still visible" }],
      },
      metadata,
      sourcePath: path,
    });

    expect(serializeToHtml(result.tree)).toBe("Still visible");
    expect(result.diagnostics[0]?.code).toBe(themeCodes.missingRenderer);
    expect(result.diagnostics[0]?.severity).toBe("warning");
  });

  it("names both the theme and the node type", () => {
    // "A paragraph looked odd" is not something a user can report usefully.
    const result = renderWithTheme(
      { id: "sparse", renderers: {} },
      { root: { type: "thematic-break" }, metadata, sourcePath: path },
    );

    expect(result.diagnostics[0]?.message).toContain("sparse");
    expect(result.diagnostics[0]?.message).toContain("thematic-break");
    expect(result.diagnostics[0]?.sourcePath).toBe(path);
  });

  it("carries the node's source position when it has one", () => {
    const result = renderWithTheme(
      { id: "sparse", renderers: {} },
      {
        root: {
          type: "thematic-break",
          range: {
            start: { line: 4, column: 1, offset: 30 },
            end: { line: 4, column: 4, offset: 33 },
          },
        },
        metadata,
        sourcePath: path,
      },
    );

    expect(result.diagnostics[0]?.range?.start.line).toBe(4);
  });

  it("lets a theme omit renderers without every node breaking", () => {
    // Adding a node type to the AST must not break every theme at once.
    const result = renderWithTheme(
      { id: "sparse", renderers: {} },
      {
        root: {
          type: "document",
          children: [
            { type: "paragraph", children: [{ type: "text", value: "a" }] },
          ],
        },
        metadata,
        sourcePath: path,
      },
    );

    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(serializeToHtml(result.tree)).toBe("a");
  });
});

describe("a renderer that throws", () => {
  const exploding: Theme = {
    id: "exploding",
    renderers: {
      ...minimalTheme.renderers,
      heading: () => {
        throw new Error("bad heading");
      },
    },
  };

  it("costs its own node, not the page", () => {
    // A server returning nothing because one table was awkward is less useful
    // than one that shows it badly and says so.
    const result = renderWithTheme(exploding, {
      root: {
        type: "document",
        children: [
          {
            type: "heading",
            depth: 1,
            children: [{ type: "text", value: "Title" }],
          },
          { type: "paragraph", children: [{ type: "text", value: "Body" }] },
        ],
      },
      metadata,
      sourcePath: path,
    });

    expect(serializeToHtml(result.tree)).toBe("Title<p>Body</p>");
    expect(result.diagnostics[0]?.code).toBe(themeCodes.rendererThrew);
    expect(result.diagnostics[0]?.severity).toBe("error");
  });

  it("preserves the original error as a cause", () => {
    const result = renderWithTheme(exploding, {
      root: { type: "heading", depth: 1, children: [] },
      metadata,
      sourcePath: path,
    });

    expect(result.diagnostics[0]?.cause).toBeInstanceOf(Error);
    expect(result.diagnostics[0]?.message).toContain("bad heading");
  });
});

describe("unsupported content", () => {
  it("is shown as preformatted source rather than lost", () => {
    const result = render({
      type: "unsupported",
      reason: "Footnote definitions are not represented yet",
      value: "[^1]: A footnote.",
      placement: "block",
    });

    expect(serializeToHtml(result.tree)).toBe(
      '<pre data-tsumugu-unsupported="true">[^1]: A footnote.</pre>',
    );
    expect(result.diagnostics[0]?.code).toBe(themeCodes.unsupportedNode);
    expect(result.diagnostics[0]?.message).toContain("Footnote definitions");
  });

  it("escapes the preserved source", () => {
    const result = render({
      type: "unsupported",
      reason: "unknown",
      value: "<script>alert(1)</script>",
      placement: "block",
    });

    expect(serializeToHtml(result.tree)).not.toContain("<script>");
  });
});

describe("what the contract deliberately excludes", () => {
  it("gives a renderer no way to reach the scanner, router or server", () => {
    // A theme that knew about routing could not be replaced without the
    // replacement understanding routing too.
    let seen: readonly string[] = [];
    renderWithTheme(
      {
        id: "introspect",
        renderers: {
          text: (_node, context) => {
            seen = Object.keys(context).sort();
            return fragment();
          },
        },
      },
      { root: { type: "text", value: "x" }, metadata, sourcePath: path },
    );

    expect(seen).toEqual(["metadata", "renderChild", "report", "sourcePath"]);
  });

  it("has no lifecycle: a theme is data and functions", () => {
    expect(Object.keys(minimalTheme).sort()).toEqual(["id", "renderers"]);
  });

  it("lets a theme extend another by composing renderers", () => {
    // Ordinary object composition rather than a framework feature.
    const loud: Theme = {
      id: "loud",
      renderers: {
        ...minimalTheme.renderers,
        text: (node) =>
          node.type === "text" ? text(node.value.toUpperCase()) : fragment(),
      },
    };

    expect(
      serializeToHtml(render({ type: "text", value: "quiet" }, loud).tree),
    ).toBe("QUIET");
  });
});
