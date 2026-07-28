import { describe, expect, it } from "vitest";

import type { RoutePath, SourcePath } from "../document/paths.js";

import { toRecord, type RecordInput } from "./records.js";
import { searchEntries, searchJson, searchSchemaVersion } from "./search.js";

function record(
  route: string,
  title: string,
  body: string,
  overrides: Partial<RecordInput> = {},
) {
  // The AST a renderer would produce for `body`, where a line starting with
  // "## " is a heading and everything else is a paragraph.
  const children = body
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) =>
      line.startsWith("## ")
        ? {
            type: "heading" as const,
            depth: 2 as const,
            id: line.slice(3).toLowerCase().replace(/\s+/gu, "-"),
            children: [{ type: "text" as const, value: line.slice(3) }],
          }
        : {
            type: "paragraph" as const,
            children: [{ type: "text" as const, value: line }],
          },
    );

  return toRecord({
    route: route as RoutePath,
    sourcePath: "a.md" as SourcePath,
    title,
    format: "markdown",
    hidden: false,
    generated: false,
    renderable: true,
    root: { type: "document", children },
    ...overrides,
  });
}

const records = [
  record(
    "/guide",
    "Guide",
    [
      "Before any heading.",
      "## Install",
      "Run the installer.",
      "## Configure",
      "Set the root.",
    ].join("\n"),
    { description: "How to use it" },
  ),
  record("/draft", "Draft", "Secret plans.", { hidden: true }),
];

describe("searchEntries", () => {
  it("splits a document into one entry per section", () => {
    const entries = searchEntries(records);

    expect(entries.map((entry) => entry.id)).toEqual([
      "/guide",
      "/guide#install",
      "/guide#configure",
    ]);
  });

  it("links each section to its own heading", () => {
    const install = searchEntries(records).find(
      (entry) => entry.section === "Install",
    );

    expect(install?.url).toBe("/guide#install");
    expect(install?.document).toBe("Guide");
    expect(install?.text).toBe("Run the installer.");
  });

  it("keeps the document's description on the entry for the page itself", () => {
    const [page] = searchEntries(records);

    expect(page?.description).toBe("How to use it");
    expect(page?.section).toBeUndefined();
  });

  it("leaves hidden documents out", () => {
    // A page kept out of the navigation is a page the author did not want
    // found by browsing, and search is browsing.
    expect(
      searchEntries(records).some((entry) => entry.document === "Draft"),
    ).toBe(false);
  });

  it("leaves generated and unrenderable documents out", () => {
    const excluded = [
      record("/made-up", "Generated", "x", { generated: true }),
      record("/broken", "Broken", "x", { renderable: false }),
    ];

    expect(searchEntries(excluded)).toEqual([]);
  });

  it("still indexes a document with a title and no text", () => {
    const entries = searchEntries([record("/stub", "Stub", "")]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "/stub", document: "Stub" });
  });

  it("indexes text outside ASCII unchanged", () => {
    const entries = searchEntries([
      record("/ja", "日本語", ["## 配置", "設定を書きます。"].join("\n")),
    ]);

    expect(entries.at(-1)?.text).toBe("設定を書きます。");
    expect(entries.at(-1)?.url).toBe("/ja#配置");
  });
});

describe("searchJson", () => {
  it("declares a schema version and produces the same bytes each time", () => {
    const first = searchJson(records);

    expect(JSON.parse(first)).toMatchObject({
      schemaVersion: searchSchemaVersion,
      generator: "tsumugu",
    });
    expect(first).toBe(searchJson(records));
  });

  it("carries text rather than tokens", () => {
    // Tokenizing here would fix a matching strategy into a file that a browser,
    // a build and a future server-side search would all have to agree with.
    expect(searchJson(records)).not.toContain('"tokens"');
    expect(searchJson(records)).toContain("Run the installer.");
  });
});
