import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { LoadedDocument, SemanticNode } from "tsumugu-core";
import { describe, expect, it } from "vitest";

import { createMdxRenderer, mdxCodes } from "./index.js";

const root = fileURLToPath(new URL("../test-fixtures", import.meta.url));
const renderer = createMdxRenderer({ root });

/**
 * A loaded document, built by hand from a fixture file on disk.
 *
 * The fixtures are real files because execution is: imports resolve on the
 * file system, and a test that mocked that away would prove nothing about
 * the one behavior this package exists for.
 */
async function documentOf(name: string): Promise<LoadedDocument> {
  const content = await readFile(path.join(root, name), "utf8");
  return {
    stage: "loaded",
    id: name as LoadedDocument["id"],
    sourcePath: name as LoadedDocument["sourcePath"],
    format: "mdx",
    stat: { size: content.length, modifiedAtMs: 1 },
    contentHash: "hash",
    content,
    metadata: { values: new Map() },
    route: `/${name}` as LoadedDocument["route"],
    diagnostics: [],
  };
}

function flatten(node: SemanticNode): SemanticNode[] {
  const children = "children" in node ? node.children : [];
  return [node, ...children.flatMap((child) => flatten(child))];
}

function textOf(node: SemanticNode): string {
  return flatten(node)
    .map((candidate) => ("value" in candidate ? candidate.value : ""))
    .join("");
}

describe("createMdxRenderer", () => {
  it("claims .mdx and nothing else", async () => {
    const document = await documentOf("basic.mdx");

    expect(renderer.supports(document)).toBe(true);
    expect(renderer.supports({ ...document, format: "markdown" })).toBe(false);
  });

  it("executes expressions, components and imports to static content", async () => {
    const result = await renderer.render(await documentOf("basic.mdx"));
    const text = textOf(result.root);

    // The expression evaluated, the imported component rendered, and neither
    // survives as source.
    expect(text).toContain("The answer is 42");
    expect(text).toContain("shiny");
    expect(text).not.toContain("40 + 2");
    expect(text).not.toContain("<Badge>");
    expect(result.diagnostics ?? []).toEqual([]);
  });

  it("keeps front matter driving the shared metadata precedence", async () => {
    const result = await renderer.render(await documentOf("basic.mdx"));

    expect(result.metadata).toContainEqual(["title", "From front matter"]);
  });

  it("resolves bare specifiers through ordinary Node resolution", async () => {
    const result = await renderer.render(await documentOf("npm.mdx"));

    expect(textOf(result.root)).toContain("resolved");
  });

  it("refuses an import that resolves outside the root", async () => {
    const result = await renderer.render(await documentOf("escape.mdx"));

    const failure = result.diagnostics?.find(
      (diagnostic) => diagnostic.code === mdxCodes.executionFailed,
    );
    expect(failure?.message).toContain("outside the documentation root");
    // The machine's paths stay on the machine.
    expect(failure?.message).not.toContain(root);
  });

  it("renders an empty document as an empty page, not a failure", async () => {
    const result = await renderer.render(await documentOf("empty.mdx"));

    expect(result.root.children).toEqual([]);
    expect(result.diagnostics ?? []).toEqual([]);
  });

  it("refuses to hash an inline script and says why", async () => {
    const result = await renderer.render(await documentOf("script.mdx"));

    // MDX read the script's content as content; what reaches the page is not
    // what the author typed, so nothing is allowed to run.
    expect(result.scripts ?? []).toHaveLength(0);
    expect(
      result.diagnostics?.some(
        (diagnostic) => diagnostic.code === mdxCodes.inlineScript,
      ),
    ).toBe(true);
  });

  it("says nothing about a script that references a file", async () => {
    const result = await renderer.render(await documentOf("script-file.mdx"));

    // A file is covered by 'self' and never passes through MDX at all.
    expect(
      result.diagnostics?.some(
        (diagnostic) => diagnostic.code === mdxCodes.inlineScript,
      ),
    ).toBe(false);
    expect(JSON.stringify(result.root)).toContain("./demo.js");
  });

  it("falls back to the non-executing rendering when evaluation throws", async () => {
    const result = await renderer.render(await documentOf("throws.mdx"));

    const failure = result.diagnostics?.find(
      (diagnostic) => diagnostic.code === mdxCodes.executionFailed,
    );
    expect(failure?.severity).toBe("warning");
    expect(failure?.message).toContain("throws.mdx");
    // ADR 6 rendering: the island is shown as written rather than lost.
    expect(JSON.stringify(result.root)).toContain("component exploded");
  });
});
