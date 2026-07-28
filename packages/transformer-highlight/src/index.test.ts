import {
  runTransformers,
  type CodeBlockNode,
  type DocumentNode,
  type SourcePath,
} from "@tsumugu/core";
import { describe, expect, it } from "vitest";

import {
  createHighlightTransformer,
  highlightCodes,
  resolveLanguage,
} from "./index.js";

const sourcePath = "guide.md" as SourcePath;

function documentOf(...blocks: CodeBlockNode[]): DocumentNode {
  return { type: "document", children: blocks };
}

function codeBlock(value: string, language?: string): CodeBlockNode {
  return {
    type: "code-block",
    value,
    ...(language === undefined ? {} : { language }),
  };
}

/** Runs the transformer and returns the first block plus any diagnostics. */
async function highlight(document: DocumentNode): Promise<{
  readonly block: CodeBlockNode | undefined;
  readonly codes: readonly string[];
}> {
  const result = await runTransformers(
    [createHighlightTransformer()],
    document,
    { sourcePath },
  );

  const first = result.root.children[0];

  return {
    block: first?.type === "code-block" ? first : undefined,
    codes: result.diagnostics.map((diagnostic) => diagnostic.code),
  };
}

describe("resolveLanguage", () => {
  it.each([
    ["ts", "ts"],
    ["TypeScript", "typescript"],
    ["  js  ", "js"],
    ["sh", "shellscript"],
    ["console", "shellscript"],
    ["text", "plaintext"],
  ])("resolves %j to %j", (written, expected) => {
    expect(resolveLanguage(written)).toBe(expected);
  });

  it.each(["", "  ", "klingon", "not-a-language"])(
    "has nothing for %j",
    (written) => {
      expect(resolveLanguage(written)).toBeUndefined();
    },
  );
});

describe("createHighlightTransformer", () => {
  it("annotates a block with tokens carrying both colour schemes", async () => {
    const { block } = await highlight(
      documentOf(codeBlock("const answer = 42;\n", "ts")),
    );

    const tokens = block?.highlighted?.[0] ?? [];
    expect(tokens.length).toBeGreaterThan(1);
    expect(tokens[0]?.color).toMatch(/^#[0-9A-Fa-f]{6}$/u);
    expect(tokens[0]?.darkColor).toMatch(/^#[0-9A-Fa-f]{6}$/u);
  });

  it("leaves the original code exactly as the author wrote it", async () => {
    const source = "const a = 1;\n\nconst b = 2;\n";
    const { block } = await highlight(documentOf(codeBlock(source, "ts")));

    expect(block?.value).toBe(source);
    // The tokens rebuild the same text, character for character, which is what
    // lets a copy button and an export use either one.
    expect(
      (block?.highlighted ?? [])
        .map((line) => line.map((token) => token.value).join(""))
        .join("\n"),
    ).toBe(source);
  });

  it("keeps markup-shaped source as text, never as markup", async () => {
    const { block } = await highlight(
      documentOf(codeBlock('<script>alert("x")</script>\n', "html")),
    );

    const text = (block?.highlighted ?? [])
      .flat()
      .map((token) => token.value)
      .join("");

    // A token is text and a colour. There is nowhere for markup to go, which is
    // why the highlighter cannot inject any.
    expect(text).toContain("<script>");
    expect(block?.highlighted?.[0]?.[0]).not.toHaveProperty("html");
  });

  it("highlights text outside ASCII", async () => {
    const { block } = await highlight(
      documentOf(codeBlock('const 挨拶 = "こんにちは";\n', "ts")),
    );

    expect(
      (block?.highlighted ?? [])
        .flat()
        .map((token) => token.value)
        .join(""),
    ).toContain("こんにちは");
  });

  it("reports an unknown language once and leaves the block alone", async () => {
    const { block, codes } = await highlight(
      documentOf(
        codeBlock("x := 1\n", "klingon"),
        codeBlock("y := 2\n", "klingon"),
      ),
    );

    expect(block?.highlighted).toBeUndefined();
    expect(codes).toEqual([highlightCodes.unknownLanguage]);
  });

  it("leaves a block with no language alone, without complaining", async () => {
    const { block, codes } = await highlight(documentOf(codeBlock("plain\n")));

    expect(block?.highlighted).toBeUndefined();
    expect(codes).toEqual([]);
  });

  it("leaves an empty block alone", async () => {
    const { block, codes } = await highlight(documentOf(codeBlock("", "ts")));

    expect(block?.highlighted).toBeUndefined();
    expect(codes).toEqual([]);
  });

  it("returns the document unchanged when it has no code at all", async () => {
    const document: DocumentNode = {
      type: "document",
      children: [
        { type: "paragraph", children: [{ type: "text", value: "x" }] },
      ],
    };

    const result = await runTransformers(
      [createHighlightTransformer()],
      document,
      { sourcePath },
    );

    expect(result.root).toBe(document);
  });

  it("handles a long line without splitting it", async () => {
    const line = `const x = "${"a".repeat(5000)}";\n`;
    const { block } = await highlight(documentOf(codeBlock(line, "ts")));

    expect(
      (block?.highlighted ?? [])
        .flat()
        .map((token) => token.value)
        .join(""),
    ).toHaveLength(line.length - 1);
  });

  it("produces the same tokens every time", async () => {
    const source = "export const version = 1;\n";
    const first = await highlight(documentOf(codeBlock(source, "ts")));
    const second = await highlight(documentOf(codeBlock(source, "ts")));

    expect(first.block?.highlighted).toEqual(second.block?.highlighted);
  });
});
