import { describe, expect, it } from "vitest";

import type { DocumentNode, HeadingNode } from "../ast/nodes.js";
import { createHeadingIdTransformer } from "../transformer/heading-ids.js";
import { runTransformers } from "../transformer/contract.js";
import type { SourcePath } from "../document/paths.js";

import {
  buildTableOfContents,
  type TableOfContentsEntry,
} from "./table-of-contents.js";

function heading(depth: HeadingNode["depth"], text: string): HeadingNode {
  return { type: "heading", depth, children: [{ type: "text", value: text }] };
}

/** Runs the heading-id transformer first, as the pipeline does. */
async function outlineOf(
  ...headings: readonly HeadingNode[]
): Promise<readonly TableOfContentsEntry[]> {
  const root: DocumentNode = { type: "document", children: [...headings] };
  const transformed = await runTransformers(
    [createHeadingIdTransformer()],
    root,
    { sourcePath: "guide.md" as SourcePath },
  );

  return buildTableOfContents(transformed.root);
}

/** Labels and nesting, which is what a reader of the outline sees. */
function shape(entries: readonly TableOfContentsEntry[]): unknown {
  return entries.map((entry) =>
    entry.children.length === 0
      ? entry.label
      : { [entry.label]: shape(entry.children) },
  );
}

describe("buildTableOfContents", () => {
  it("nests headings by level", async () => {
    expect(
      shape(
        await outlineOf(
          heading(1, "Page title"),
          heading(2, "Install"),
          heading(3, "From npm"),
          heading(3, "From source"),
          heading(2, "Configure"),
        ),
      ),
    ).toEqual([{ Install: ["From npm", "From source"] }, "Configure"]);
  });

  it("leaves out the page's own level-one heading", async () => {
    const outline = await outlineOf(
      heading(1, "Page title"),
      heading(2, "Real"),
    );

    expect(outline.map((entry) => entry.label)).toEqual(["Real"]);
  });

  it("links every entry to the identifier the transformer resolved", async () => {
    const outline = await outlineOf(
      heading(2, "Install"),
      heading(2, "Install"),
    );

    expect(outline.map((entry) => entry.id)).toEqual(["install", "install-2"]);
  });

  it("keeps Unicode headings addressable", async () => {
    const outline = await outlineOf(heading(2, "日本語の見出し"));

    expect(outline[0]?.id).toBe("日本語の見出し");
  });

  it("nests a skipped level under what precedes it rather than inventing a section", () => {
    expect(
      shape(
        buildTableOfContents(
          {
            type: "document",
            children: [
              { ...heading(2, "Install"), id: "install" },
              { ...heading(4, "Details"), id: "details" },
            ],
          },
          { maxDepth: 4 },
        ),
      ),
    ).toEqual([{ Install: ["Details"] }]);
  });

  it("keeps a deeper heading at the top level when nothing precedes it", async () => {
    expect(shape(await outlineOf(heading(3, "Orphan")))).toEqual(["Orphan"]);
  });

  it("is empty for a document with no headings", async () => {
    expect(await outlineOf()).toEqual([]);
  });

  it("is empty for a document whose only heading is its title", async () => {
    expect(await outlineOf(heading(1, "Only a title"))).toEqual([]);
  });

  it("omits headings deeper than the included range", async () => {
    expect(await outlineOf(heading(2, "Install"), heading(4, "Deep"))).toEqual([
      expect.objectContaining({ label: "Install" }),
    ]);
    expect(
      shape(
        buildTableOfContents(
          {
            type: "document",
            children: [
              { ...heading(2, "Install"), id: "install" },
              { ...heading(4, "Deep"), id: "deep" },
            ],
          },
          { maxDepth: 3 },
        ),
      ),
    ).toEqual(["Install"]);
  });

  it("omits a heading that has no resolved identifier", () => {
    // No transformer ran, so nothing is linkable and the outline is empty
    // rather than a list of links that go nowhere.
    expect(
      buildTableOfContents({
        type: "document",
        children: [heading(2, "Unlinked")],
      }),
    ).toEqual([]);
  });

  it("omits a heading with no readable text", () => {
    expect(
      buildTableOfContents({
        type: "document",
        children: [{ ...heading(2, "   "), id: "section" }],
      }),
    ).toEqual([]);
  });
});
