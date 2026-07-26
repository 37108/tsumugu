import type { LoadedDocument, SemanticNode } from "@tsumugu/core";
import { describe, expect, it } from "vitest";

import { createHtmlRenderer, isFullDocument } from "./index.js";

function documentOf(content: string, path = "docs/a.html"): LoadedDocument {
  return {
    stage: "loaded",
    id: path as LoadedDocument["id"],
    sourcePath: path as LoadedDocument["sourcePath"],
    format: "html",
    stat: { size: content.length, modifiedAtMs: 1 },
    contentHash: "hash",
    content,
    metadata: { values: new Map() },
    route: "/a" as LoadedDocument["route"],
    diagnostics: [],
  };
}

const renderer = createHtmlRenderer();

function render(html: string) {
  const result = renderer.render(documentOf(html));
  if (result instanceof Promise) {
    throw new Error("the HTML renderer is synchronous");
  }
  return result;
}

function nodeTypes(node: SemanticNode): string[] {
  const found: string[] = [node.type];
  if ("children" in node) {
    for (const child of node.children) {
      found.push(...nodeTypes(child));
    }
  }
  return found;
}

function firstOfType(
  node: SemanticNode,
  type: SemanticNode["type"],
): SemanticNode | undefined {
  if (node.type === type) {
    return node;
  }
  if (!("children" in node)) {
    return undefined;
  }
  for (const child of node.children) {
    const found = firstOfType(child, type);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function plainText(node: SemanticNode): string {
  if (
    node.type === "text" ||
    node.type === "inline-code" ||
    node.type === "code-block"
  ) {
    return node.value;
  }
  return "children" in node
    ? node.children.map((child) => plainText(child)).join("")
    : "";
}

describe("supports", () => {
  it("claims HTML and declines Markdown", () => {
    expect(renderer.supports(documentOf("<p>a</p>"))).toBe(true);
    expect(
      renderer.supports({ ...documentOf("# a"), format: "markdown" }),
    ).toBe(false);
  });
});

describe("full document versus fragment", () => {
  it.each([
    ["a doctype", "<!doctype html><html><body><p>a</p></body></html>"],
    ["an html element", "<html><body><p>a</p></body></html>"],
    ["a body element", "<body><p>a</p></body>"],
    ["a head element", "<head><title>t</title></head>"],
  ])("recognises %s as a complete document", (_label, source) => {
    expect(isFullDocument(source)).toBe(true);
  });

  it.each([
    ["a bare paragraph", "<p>a</p>"],
    ["a heading and text", "<h1>Title</h1><p>Body</p>"],
    ["plain text", "just words"],
    ["an empty string", ""],
  ])("recognises %s as a fragment", (_label, source) => {
    expect(isFullDocument(source)).toBe(false);
  });

  it("detects from the source, not from the parse tree", () => {
    // Parsers synthesize html/head/body for a fragment, so a tree-based check
    // would call every input a complete document.
    expect(isFullDocument("<p>a</p>")).toBe(false);
    expect(render("<p>a</p>").htmlTitle).toBeUndefined();
  });

  it("extracts the title from a complete document", () => {
    const result = render(
      "<!doctype html><html><head><title>Install guide</title></head><body><p>a</p></body></html>",
    );

    expect(result.htmlTitle).toBe("Install guide");
  });

  it("contributes no title from a fragment", () => {
    // The shared precedence simply moves on to the first heading.
    expect(render("<h1>From heading</h1>").htmlTitle).toBeUndefined();
  });

  it("ignores an empty title element", () => {
    expect(
      render(
        "<!doctype html><html><head><title>  </title></head><body></body></html>",
      ).htmlTitle,
    ).toBeUndefined();
  });

  it("prefers main over body as the document's content", () => {
    // A site header inside body is not this document's content; core owns the
    // shell.
    const result = render(
      "<!doctype html><html><body><header><p>Site header</p></header><main><p>Real content</p></main></body></html>",
    );

    expect(plainText(result.root)).toBe("Real content");
  });

  it("falls back to article, then body", () => {
    const article = render(
      "<!doctype html><html><body><article><p>From article</p></article></body></html>",
    );
    const body = render(
      "<!doctype html><html><body><p>From body</p></body></html>",
    );

    expect(plainText(article.root)).toBe("From article");
    expect(plainText(body.root)).toBe("From body");
  });
});

describe("semantic mapping", () => {
  it.each([
    ["h1", 1],
    ["h3", 3],
    ["h6", 6],
  ])("maps %s to a heading of the right depth", (tag, depth) => {
    const heading = firstOfType(render(`<${tag}>T</${tag}>`).root, "heading");

    expect(heading?.type === "heading" && heading.depth).toBe(depth);
  });

  it("maps paragraphs, emphasis and strong text", () => {
    const types = nodeTypes(
      render("<p>Plain <em>em</em> <strong>strong</strong></p>").root,
    );

    expect(types).toContain("paragraph");
    expect(types).toContain("emphasis");
    expect(types).toContain("strong");
  });

  it("maps the presentational aliases i and b to their semantic nodes", () => {
    const types = nodeTypes(render("<p><i>x</i><b>y</b></p>").root);

    expect(types).toContain("emphasis");
    expect(types).toContain("strong");
  });

  it("maps pre + code to a code block with its language", () => {
    const code = firstOfType(
      render('<pre><code class="language-bash">pnpm i\n</code></pre>').root,
      "code-block",
    );

    expect(code?.type).toBe("code-block");
    if (code?.type !== "code-block") {
      return;
    }
    expect(code.language).toBe("bash");
    expect(code.value).toBe("pnpm i\n");
  });

  it("maps a pre with no code element", () => {
    const code = firstOfType(render("<pre>raw text</pre>").root, "code-block");

    expect(code?.type === "code-block" && code.value).toBe("raw text");
  });

  it("maps inline code", () => {
    const code = firstOfType(
      render("<p>Run <code>pnpm i</code></p>").root,
      "inline-code",
    );

    expect(code?.type === "inline-code" && code.value).toBe("pnpm i");
  });

  it("maps lists, keeping nesting", () => {
    const list = firstOfType(
      render("<ul><li>One<ul><li>Nested</li></ul></li></ul>").root,
      "list",
    );

    expect(list?.type === "list" && list.ordered).toBe(false);
    expect(
      nodeTypes(list ?? { type: "text", value: "" }).filter(
        (t) => t === "list",
      ),
    ).toHaveLength(2);
  });

  it("records an ordered list's start only when it is not the default", () => {
    const plain = firstOfType(render("<ol><li>a</li></ol>").root, "list");
    const offset = firstOfType(
      render('<ol start="3"><li>a</li></ol>').root,
      "list",
    );

    expect(plain?.type === "list" && plain.start).toBeUndefined();
    expect(offset?.type === "list" && offset.start).toBe(3);
  });

  it("maps blockquotes, thematic breaks, links and images", () => {
    const types = nodeTypes(
      render(
        '<blockquote><p>q</p></blockquote><hr><p><a href="/g" title="T">g</a><img src="/a.png" alt="A"></p>',
      ).root,
    );

    expect(types).toEqual(
      expect.arrayContaining(["blockquote", "thematic-break", "link", "image"]),
    );
  });

  it("keeps a link's destination exactly as written", () => {
    const link = firstOfType(
      render('<a href="../guide.html">g</a>').root,
      "link",
    );

    expect(link?.type === "link" && link.url).toBe("../guide.html");
  });

  it("treats a missing alt as an empty string, matching Markdown", () => {
    const image = firstOfType(render('<img src="/a.png">').root, "image");

    expect(image?.type === "image" && image.alt).toBe("");
  });

  it("maps a table, marking a row of th as the header", () => {
    const table = firstOfType(
      render(
        '<table><thead><tr><th align="left">A</th><th align="right">B</th></tr></thead>' +
          "<tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
      ).root,
      "table",
    );

    expect(table?.type).toBe("table");
    if (table?.type !== "table") {
      return;
    }
    // Header-ness is a property of the row's cells, not of thead grouping —
    // which is what a screen reader and a data export both need.
    expect(table.children[0]?.header).toBe(true);
    expect(table.children[1]?.header).toBe(false);
    expect(table.align).toEqual(["left", "right"]);
  });

  it("looks through thead, tbody and tfoot for rows", () => {
    const table = firstOfType(
      render(
        "<table><tbody><tr><td>a</td></tr></tbody><tfoot><tr><td>b</td></tr></tfoot></table>",
      ).root,
      "table",
    );

    expect(table?.type === "table" && table.children).toHaveLength(2);
  });
});

describe("structural elements", () => {
  it("passes the content of grouping elements through", () => {
    // div, span and the landmark elements describe page structure, and page
    // structure is core's job through the application shell.
    const result = render("<div><section><p>Content</p></section></div>");

    expect(plainText(result.root)).toBe("Content");
    expect(nodeTypes(result.root)).not.toContain("raw-html");
  });

  it("wraps loose text at block level in a paragraph", () => {
    expect(nodeTypes(render("<div>loose</div>").root)).toContain("paragraph");
  });

  it("drops whitespace between blocks without inventing paragraphs", () => {
    const result = render("<p>a</p>\n\n  \n<p>b</p>");

    expect(
      nodeTypes(result.root).filter((t) => t === "paragraph"),
    ).toHaveLength(2);
  });
});

describe("the trust model", () => {
  it("removes script content and says so once", () => {
    const result = render(
      "<p>a</p><script>alert(1)</script><script>alert(2)</script>",
    );

    // JavaScript in documentation is disabled by default.
    expect(plainText(result.root)).toBe("a");
    expect(nodeTypes(result.root)).not.toContain("raw-html");
    // Reported once, not once per occurrence: a page full of scripts should
    // not bury every other diagnostic.
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics?.[0]?.severity).toBe("warning");
  });

  it("removes noscript content too", () => {
    expect(plainText(render("<noscript><p>fallback</p></noscript>").root)).toBe(
      "",
    );
  });

  it("preserves an unknown element as untrusted raw markup", () => {
    const raw = firstOfType(
      render("<custom-widget>x</custom-widget>").root,
      "raw-html",
    );

    expect(raw?.type).toBe("raw-html");
    if (raw?.type !== "raw-html") {
      return;
    }
    // Not dropped, because it is the author's content; not trusted, because
    // nobody said it should be.
    expect(raw.trust).toBe("untrusted");
    expect(raw.value).toContain("custom-widget");
  });

  it("preserves an unknown inline element as inline raw markup", () => {
    const raw = firstOfType(
      render("<p>a <abbr>HTML</abbr> b</p>").root,
      "raw-html",
    );

    expect(raw?.type === "raw-html" && raw.placement).toBe("inline");
  });

  it("does not sanitize a preserved element's attributes", () => {
    // Sanitizing under an undefined threat model produces false confidence.
    // The boundary is where output is written.
    const raw = firstOfType(
      render('<custom-el onclick="alert(1)">x</custom-el>').root,
      "raw-html",
    );

    expect(raw?.type === "raw-html" && raw.trust).toBe("untrusted");
  });

  it("drops document metadata elements without complaining", () => {
    // Reporting each meta and link would train a reader to ignore diagnostics.
    const result = render(
      '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="a.css"><title>t</title></head><body><p>a</p></body></html>',
    );

    expect(result.diagnostics).toEqual([]);
    expect(plainText(result.root)).toBe("a");
  });

  it("drops style content, which is presentation rather than meaning", () => {
    expect(plainText(render("<style>p{color:red}</style><p>a</p>").root)).toBe(
      "a",
    );
  });
});

describe("malformed and awkward input", () => {
  it("recovers from unclosed tags", () => {
    const result = render("<p>one<p>two");

    expect(
      nodeTypes(result.root).filter((t) => t === "paragraph"),
    ).toHaveLength(2);
  });

  it("recovers from mismatched nesting", () => {
    expect(plainText(render("<p><em>a</p></em>").root)).toContain("a");
  });

  it("renders an empty document as an empty document node", () => {
    const result = render("");

    expect(result.root.type).toBe("document");
    expect(result.root.children).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("renders a document that is only whitespace", () => {
    expect(render("   \n  ").root.children).toEqual([]);
  });

  it("keeps Unicode intact", () => {
    expect(plainText(render("<h1>ガイド — naïve 🎉</h1>").root)).toBe(
      "ガイド — naïve 🎉",
    );
  });

  it("ignores comments", () => {
    expect(plainText(render("<!-- hidden --><p>shown</p>").root)).toBe("shown");
  });

  it("is deterministic", () => {
    const html =
      "<h1>A</h1><ul><li>x</li></ul><table><tr><td>1</td></tr></table>";

    expect(JSON.stringify(render(html).root)).toBe(
      JSON.stringify(render(html).root),
    );
  });
});

describe("agreement with the Markdown renderer", () => {
  it("produces the same tree shape for the same meaning", () => {
    // The whole point of the Semantic AST: below it, format has stopped
    // mattering. This is the property that makes HTML a first-class input.
    // Compared without source positions: the two formats agree on meaning,
    // and they cannot agree on where in their own file that meaning was.
    const result = JSON.parse(
      JSON.stringify(
        render("<h2>Install</h2><p>Run <code>pnpm i</code>.</p>").root,
      ),
      (key: string, value: unknown) => (key === "range" ? undefined : value),
    ) as unknown;

    expect(result).toEqual({
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
    });
  });
});
