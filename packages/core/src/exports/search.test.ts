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
  // The AST a renderer would produce for `body`, where a line of leading "#"
  // is a heading at that depth and everything else is a paragraph.
  const children = body
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const hashes = /^(#{1,6}) /u.exec(line);
      if (hashes === null) {
        return {
          type: "paragraph" as const,
          children: [{ type: "text" as const, value: line }],
        };
      }

      const depth = hashes[1]?.length as 1 | 2 | 3 | 4 | 5 | 6;
      const value = line.slice(depth + 1);
      return {
        type: "heading" as const,
        depth,
        id: value.toLowerCase().replace(/\s+/gu, "-"),
        children: [{ type: "text" as const, value }],
      };
    });

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

    expect(entries.map((entry) => entry.url)).toEqual([
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
    expect(entries[0]).toMatchObject({ url: "/stub", document: "Stub" });
  });

  it("gives a subsection the headings above it", () => {
    // "Negative" says nothing on its own. RFC 6.
    const nested = searchEntries([
      record(
        "/adr",
        "A decision",
        [
          "## Consequences",
          "It has some.",
          "### Negative",
          "It costs a thing.",
        ].join("\n"),
      ),
    ]);
    const negative = nested.find((entry) => entry.section === "Negative");

    expect(negative?.trail).toBe("Consequences");
    expect(
      nested.find((entry) => entry.section === "Consequences")?.trail,
    ).toBeUndefined();
  });

  it("closes a trail when a heading of the same depth arrives", () => {
    const entries = searchEntries([
      record(
        "/adr",
        "A decision",
        ["## First", "a", "### Inner", "b", "## Second", "c"].join("\n"),
      ),
    ]);

    // "Second" is a sibling of "First", not a child of "Inner".
    expect(entries.find((e) => e.section === "Second")?.trail).toBeUndefined();
    expect(entries.find((e) => e.section === "Inner")?.trail).toBe("First");
  });

  it("keeps the document's own title out of the trail", () => {
    // A page whose first heading repeats its title would otherwise pay for it
    // in every entry, and `document` already carries it.
    const entries = searchEntries([
      record(
        "/page",
        "Guide",
        ["# Guide", "intro", "## Install", "x"].join("\n"),
      ),
    ]);

    expect(entries.find((e) => e.section === "Install")?.trail).toBeUndefined();
  });

  it("carries no identity beside the URL", () => {
    // `id` was the route before percent-encoding and before the base path, so
    // it repeated `url` for 13% of the file and nothing read it. RFC 5.
    for (const entry of searchEntries(records)) {
      expect(entry).not.toHaveProperty("id");
    }
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

  it("carries each section's text whole, never truncated", () => {
    // RFC 5 measured truncation: bounding the text at 300 characters saved 38%
    // of the file and removed 32% of the corpus's distinct words from the
    // index. A reader cannot find what is not there.
    const long = "unmistakable ".repeat(200) + "needle";
    const entries = searchEntries([record("/long", "Long", long)]);

    expect(entries[0]?.text).toContain("needle");
  });

  it("writes one entry per line, so a diff names the section that changed", () => {
    const lines = searchJson(records).trim().split("\n");

    // Header, one line per entry, and the closing bracket.
    expect(lines).toHaveLength(searchEntries(records).length + 2);
    expect(searchJson(records)).not.toContain("\n  ");
  });
});
