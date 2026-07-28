import type { LoadedDocument, SemanticNode } from "tsumugu-core";
import { describe, expect, it } from "vitest";

import { createMarkdownRenderer } from "./index.js";

/**
 * A loaded document, built without core's internal constructors.
 *
 * The renderer receives whatever the pipeline hands it; building the input by
 * hand keeps this test to the package's own public contract.
 */
function documentOf(content: string, path = "docs/a.md"): LoadedDocument {
  return {
    stage: "loaded",
    id: path as LoadedDocument["id"],
    sourcePath: path as LoadedDocument["sourcePath"],
    format: "markdown",
    stat: { size: content.length, modifiedAtMs: 1 },
    contentHash: "hash",
    content,
    metadata: { values: new Map() },
    route: "/a" as LoadedDocument["route"],
    diagnostics: [],
  };
}

const renderer = createMarkdownRenderer();

function render(markdown: string) {
  const result = renderer.render(documentOf(markdown));
  if (result instanceof Promise) {
    throw new Error("the Markdown renderer is synchronous");
  }
  return result;
}

/** Every node type present in a tree, for compact assertions. */
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

describe("supports", () => {
  it("claims Markdown and declines HTML", () => {
    expect(renderer.supports(documentOf("# a"))).toBe(true);
    expect(
      renderer.supports({ ...documentOf("<p>a</p>"), format: "html" }),
    ).toBe(false);
  });
});

describe("block constructs", () => {
  it("renders a heading with its outline level", () => {
    const heading = firstOfType(render("## Install").root, "heading");

    expect(heading?.type).toBe("heading");
    if (heading?.type !== "heading") {
      return;
    }
    expect(heading.depth).toBe(2);
  });

  it("renders paragraphs, emphasis and strong text", () => {
    const types = nodeTypes(render("Plain *em* and **strong**.").root);

    expect(types).toContain("paragraph");
    expect(types).toContain("emphasis");
    expect(types).toContain("strong");
  });

  it("renders a fenced code block with its language as written", () => {
    const code = firstOfType(render("```bash\npnpm i\n```").root, "code-block");

    expect(code?.type).toBe("code-block");
    if (code?.type !== "code-block") {
      return;
    }
    expect(code.language).toBe("bash");
    expect(code.value).toBe("pnpm i");
  });

  it("leaves a fenced block with no language without one", () => {
    const code = firstOfType(render("```\nplain\n```").root, "code-block");

    expect(code?.type === "code-block" && code.language).toBeUndefined();
  });

  it("renders nested lists as blocks inside items", () => {
    const markdown = "- One\n  - Nested\n- Two\n";
    const list = firstOfType(render(markdown).root, "list");

    expect(list?.type).toBe("list");
    if (list?.type !== "list") {
      return;
    }
    expect(list.ordered).toBe(false);
    expect(nodeTypes(list).filter((type) => type === "list")).toHaveLength(2);
  });

  it("records an ordered list's start only when it is not the default", () => {
    const plain = firstOfType(render("1. a\n2. b\n").root, "list");
    const offset = firstOfType(render("3. a\n4. b\n").root, "list");

    expect(plain?.type === "list" && plain.start).toBeUndefined();
    expect(offset?.type === "list" && offset.start).toBe(3);
  });

  it("renders blockquotes and thematic breaks", () => {
    const types = nodeTypes(render("> Quoted\n\n---\n").root);

    expect(types).toContain("blockquote");
    expect(types).toContain("thematic-break");
  });

  it("renders a GFM table with alignment and a header row", () => {
    const markdown = "| A | B |\n| :-- | --: |\n| 1 | 2 |\n";
    const table = firstOfType(render(markdown).root, "table");

    expect(table?.type).toBe("table");
    if (table?.type !== "table") {
      return;
    }
    // GFM tables are one of exactly two intentional extensions beyond
    // CommonMark: documentation has tables and CommonMark has none.
    expect(table.align).toEqual(["left", "right"]);
    expect(table.children).toHaveLength(2);
    expect(table.children[0]?.header).toBe(true);
    expect(table.children[1]?.header).toBe(false);
  });
});

describe("inline constructs", () => {
  it("renders links with their destination exactly as written", () => {
    const link = firstOfType(
      render("[Guide](../guide.md 'Title')").root,
      "link",
    );

    expect(link?.type).toBe("link");
    if (link?.type !== "link") {
      return;
    }
    // Resolving relative links happens later, where a diagnostic can report a
    // broken one rather than a node silently disappearing.
    expect(link.url).toBe("../guide.md");
    expect(link.title).toBe("Title");
  });

  it("renders images with alternative text", () => {
    const image = firstOfType(render("![A diagram](/a.png)").root, "image");

    expect(image?.type).toBe("image");
    if (image?.type !== "image") {
      return;
    }
    expect(image.alt).toBe("A diagram");
    expect(image.url).toBe("/a.png");
  });

  it("gives an image with no alt text an empty string, which marks it decorative", () => {
    const image = firstOfType(render("![](/a.png)").root, "image");

    expect(image?.type === "image" && image.alt).toBe("");
  });

  it("renders inline code", () => {
    const code = firstOfType(render("Run `pnpm i` now.").root, "inline-code");

    expect(code?.type === "inline-code" && code.value).toBe("pnpm i");
  });
});

describe("raw HTML", () => {
  it("is preserved and marked untrusted", () => {
    const html = firstOfType(render("<figure>x</figure>\n").root, "raw-html");

    expect(html?.type).toBe("raw-html");
    if (html?.type !== "raw-html") {
      return;
    }
    // Documentation markup is content, not application code. What reaches the
    // page is the serializer's decision under the security policy.
    expect(html.trust).toBe("untrusted");
    expect(html.placement).toBe("block");
  });

  it("marks inline HTML as inline", () => {
    const html = firstOfType(
      render("Text with <b>bold</b> inside.").root,
      "raw-html",
    );

    expect(html?.type === "raw-html" && html.placement).toBe("inline");
  });

  it("never turns a script tag into anything executable in the AST", () => {
    const result = render("<script>alert(1)</script>\n");
    const html = firstOfType(result.root, "raw-html");

    // The renderer's job is to preserve, not to sanitize or to trust.
    expect(html?.type === "raw-html" && html.trust).toBe("untrusted");
    expect(nodeTypes(result.root)).not.toContain("script");
  });
});

describe("front matter", () => {
  it("returns entries and keeps the block out of the document body", () => {
    const result = render("---\ntitle: A page\norder: 2\n---\n\n# Heading\n");

    expect(result.metadata).toEqual([
      ["order", 2],
      ["title", "A page"],
    ]);
    // The block is metadata, not content: it must not be rendered.
    expect(nodeTypes(result.root)).not.toContain("yaml");
    expect(nodeTypes(result.root)).toContain("heading");
  });

  it("returns entries sorted, so output does not depend on key order", () => {
    const result = render("---\nz: 1\na: 2\n---\n\ntext\n");

    expect(result.metadata?.map(([key]) => key)).toEqual(["a", "z"]);
  });

  it("warns and keeps the document when the YAML is malformed", () => {
    // A stray colon must not cost a reader the page.
    const result = render("---\ntitle: [unclosed\n---\n\n# Still here\n");

    expect(result.diagnostics?.[0]?.severity).toBe("warning");
    expect(nodeTypes(result.root)).toContain("heading");
  });

  it("warns about a value metadata cannot represent", () => {
    const result = render("---\nnested:\n  a: 1\n---\n\ntext\n");

    expect(result.metadata).toEqual([]);
    expect(result.diagnostics?.[0]?.message).toContain("nested mapping");
  });

  it("accepts the value types front matter really uses", () => {
    const result = render(
      "---\ntitle: A\norder: 1\nhidden: true\ntags:\n  - a\n  - b\nempty:\n---\n\ntext\n",
    );

    expect(result.metadata).toEqual([
      ["empty", null],
      ["hidden", true],
      ["order", 1],
      ["tags", ["a", "b"]],
      ["title", "A"],
    ]);
  });

  it("does not decide what the title is", () => {
    // Precedence is shared across formats and lives in core, so an HTML page
    // and a Markdown page cannot disagree.
    const result = render(
      "---\ntitle: From front matter\n---\n\n# From heading\n",
    );

    expect(result.metadata).toEqual([["title", "From front matter"]]);
    expect(firstOfType(result.root, "heading")).toBeDefined();
  });
});

describe("constructs the AST cannot represent yet", () => {
  it("keeps a hard line break's source and warns", () => {
    const result = render("One  \nTwo\n");
    const node = firstOfType(result.root, "unsupported");

    expect(node?.type).toBe("unsupported");
    expect(result.diagnostics?.[0]?.severity).toBe("warning");
  });

  it("keeps a reference definition's source and warns", () => {
    const result = render("[ref]: /target\n");
    const node = firstOfType(result.root, "unsupported");

    // A gap in Tsumugu is not a mistake by the author, and their text is not
    // Tsumugu's to discard.
    expect(node?.type === "unsupported" && node.value).toContain("/target");
  });

  it("reports the position of what it could not represent", () => {
    const result = render("Line one\n\nOne  \nTwo\n");

    expect(result.diagnostics?.[0]?.range?.start.line).toBeGreaterThan(1);
  });
});

describe("source positions", () => {
  it("are preserved for every node the parser positions", () => {
    const heading = firstOfType(render("# One\n\n## Two\n").root, "heading");

    expect(heading?.range?.start.line).toBe(1);
    expect(heading?.range?.start.column).toBe(1);
    expect(heading?.range?.end.offset).toBeGreaterThan(0);
  });
});

describe("edge cases", () => {
  it("renders an empty document as an empty document node", () => {
    const result = render("");

    expect(result.root.type).toBe("document");
    expect(result.root.children).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("renders a document that is only front matter", () => {
    const result = render("---\ntitle: A\n---\n");

    expect(result.root.children).toEqual([]);
    expect(result.metadata).toEqual([["title", "A"]]);
  });

  it("keeps Unicode text intact", () => {
    const result = render("# ガイド — naïve 🎉\n");
    const heading = firstOfType(result.root, "heading");

    expect(heading?.type === "heading" && heading.children[0]).toEqual(
      expect.objectContaining({ type: "text", value: "ガイド — naïve 🎉" }),
    );
  });

  it("is deterministic", () => {
    const markdown = "# A\n\n- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |\n";

    expect(JSON.stringify(render(markdown).root)).toBe(
      JSON.stringify(render(markdown).root),
    );
  });

  it("does not modify the document it was given", () => {
    const document = documentOf("# A\n");
    const before = JSON.stringify(document);
    render(document.content);

    expect(JSON.stringify(document)).toBe(before);
  });
});

describe("MDX", () => {
  function mdxDocument(content: string): LoadedDocument {
    return { ...documentOf(content, "docs/page.mdx"), format: "mdx" };
  }

  it("claims .mdx documents", () => {
    expect(createMarkdownRenderer().supports(mdxDocument("# Hi\n"))).toBe(true);
  });

  it("renders the Markdown parts exactly as Markdown", async () => {
    const result = await createMarkdownRenderer().render(
      mdxDocument("# Title\n\nSome **bold** prose.\n"),
    );

    expect(result.diagnostics ?? []).toEqual([]);
    expect(JSON.stringify(result.root)).toContain('"strong"');
  });

  it("preserves an expression as source and never evaluates it", async () => {
    const result = await createMarkdownRenderer().render(
      mdxDocument("The year is {new Date().getFullYear()}.\n"),
    );

    const text = JSON.stringify(result.root);
    // The source survives, escaped; no evaluation result appears anywhere.
    expect(text).toContain("getFullYear");
    expect(text).toContain('"unsupported"');
    expect(
      (result.diagnostics ?? []).some((entry) =>
        entry.message.includes("not executed"),
      ),
    ).toBe(true);
  });

  it("preserves a component and an import the same way", async () => {
    const result = await createMarkdownRenderer().render(
      mdxDocument('import X from "./x.js"\n\n<Widget prop={1}>hi</Widget>\n'),
    );

    const text = JSON.stringify(result.root);
    expect(text).toContain("Widget");
    expect(text).toContain("import X");
    expect(result.diagnostics?.length).toBe(2);
  });

  it("reads front matter in MDX like everywhere else", async () => {
    const result = await createMarkdownRenderer().render(
      mdxDocument("---\ntitle: From MDX\n---\n\n# Body\n"),
    );

    expect(result.metadata).toContainEqual(["title", "From MDX"]);
  });

  it("does not parse MDX syntax inside ordinary Markdown", async () => {
    // In .md, braces are just text: an .md file must not change meaning
    // because MDX exists.
    const result = await createMarkdownRenderer().render(
      documentOf("Braces {are} text.\n"),
    );

    expect(JSON.stringify(result.root)).toContain("Braces {are} text.");
    expect(result.diagnostics ?? []).toEqual([]);
  });
});
