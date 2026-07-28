import { describe, expect, it } from "vitest";

import type { DocumentNode, HeadingNode } from "../ast/nodes.js";
import { visit } from "../ast/traverse.js";
import type { SourcePath } from "../document/paths.js";

import { runTransformers } from "./contract.js";
import {
  createHeadingIdTransformer,
  fallbackHeadingId,
  slugifyHeading,
} from "./heading-ids.js";

const sourcePath = "guide/setup.md" as SourcePath;

function heading(
  text: string,
  options: { readonly depth?: HeadingNode["depth"]; readonly id?: string } = {},
): HeadingNode {
  return {
    type: "heading",
    depth: options.depth ?? 2,
    children: [{ type: "text", value: text }],
    ...(options.id === undefined ? {} : { id: options.id }),
  };
}

function documentOf(...children: HeadingNode[]): DocumentNode {
  return { type: "document", children };
}

async function idsOf(root: DocumentNode): Promise<{
  readonly ids: readonly (string | undefined)[];
  readonly codes: readonly string[];
}> {
  const result = await runTransformers([createHeadingIdTransformer()], root, {
    sourcePath,
  });

  const ids: (string | undefined)[] = [];
  visit(result.root, (node) => {
    if (node.type === "heading") {
      ids.push(node.id);
    }
    return "continue";
  });

  return { ids, codes: result.diagnostics.map((entry) => entry.code) };
}

describe("slugifyHeading", () => {
  it.each([
    ["Getting started", "getting-started"],
    ["  Spaced   out  ", "spaced-out"],
    ["Install the CLI!", "install-the-cli"],
    ["What's new?", "whats-new"],
    ["C++ and C#", "c-and-c"],
    ["Release 1.2.3", "release-123"],
    ["日本語の見出し", "日本語の見出し"],
    ["Café", "café"],
    ["🚀 Launch", "launch"],
    ["🚀", fallbackHeadingId],
    ["---", fallbackHeadingId],
    ["", fallbackHeadingId],
  ])("turns %j into %j", (input, expected) => {
    expect(slugifyHeading(input)).toBe(expected);
  });

  it("is stable across repeated calls", () => {
    expect(slugifyHeading("Getting started")).toBe(
      slugifyHeading("Getting started"),
    );
  });

  it("treats text that normalizes identically as identical", () => {
    // "é" written as one code point and as "e" plus a combining accent.
    expect(slugifyHeading("Café")).toBe(slugifyHeading("Café"));
  });
});

describe("createHeadingIdTransformer", () => {
  it("gives every heading an identifier", async () => {
    const { ids } = await idsOf(
      documentOf(
        heading("Getting started", { depth: 1 }),
        heading("Install the CLI"),
      ),
    );

    expect(ids).toEqual(["getting-started", "install-the-cli"]);
  });

  it("makes duplicate headings unique in document order", async () => {
    const { ids } = await idsOf(
      documentOf(heading("Options"), heading("Options"), heading("Options")),
    );

    expect(ids).toEqual(["options", "options-2", "options-3"]);
  });

  it("keeps an identifier the source stated", async () => {
    const { ids, codes } = await idsOf(
      documentOf(heading("Installing", { id: "install" })),
    );

    expect(ids).toEqual(["install"]);
    expect(codes).toEqual([]);
  });

  it("warns and renames when two headings claim one identifier", async () => {
    const { ids, codes } = await idsOf(
      documentOf(
        heading("Installing", { id: "install" }),
        heading("Also installing", { id: "install" }),
      ),
    );

    expect(ids).toEqual(["install", "install-2"]);
    expect(codes).toEqual(["transformer/duplicate-heading-id"]);
  });

  it("warns and derives one when a stated identifier cannot be a fragment", async () => {
    const { ids, codes } = await idsOf(
      documentOf(heading("Installing", { id: "not a fragment" })),
    );

    expect(ids).toEqual(["installing"]);
    expect(codes).toEqual(["transformer/invalid-heading-id"]);
  });

  it("still addresses a heading with no usable text", async () => {
    const { ids } = await idsOf(documentOf(heading("🚀"), heading("✨")));

    expect(ids).toEqual([fallbackHeadingId, `${fallbackHeadingId}-2`]);
  });

  it("produces the same identifiers every time it runs", async () => {
    const document = documentOf(heading("Options"), heading("Options"));

    expect((await idsOf(document)).ids).toEqual((await idsOf(document)).ids);
  });

  it("leaves a document without headings alone", async () => {
    const root: DocumentNode = {
      type: "document",
      children: [
        { type: "paragraph", children: [{ type: "text", value: "x" }] },
      ],
    };

    const result = await runTransformers([createHeadingIdTransformer()], root, {
      sourcePath,
    });

    expect(result.root).toBe(root);
  });
});
