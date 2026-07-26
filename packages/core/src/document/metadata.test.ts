import { describe, expect, it } from "vitest";

import {
  emptyMetadata,
  metadataString,
  normalizeMetadataKey,
  toDocumentMetadata,
  type MetadataValue,
} from "./metadata.js";

describe("normalizeMetadataKey", () => {
  it("lower-cases and trims", () => {
    expect(normalizeMetadataKey("  Title ")).toBe("title");
    expect(normalizeMetadataKey("DESCRIPTION")).toBe("description");
  });
});

describe("toDocumentMetadata", () => {
  it("normalizes keys so casing cannot change behaviour", () => {
    const metadata = toDocumentMetadata([
      ["Title", "Getting started"],
      ["DRAFT", true],
    ]);

    expect(metadata.values.get("title")).toBe("Getting started");
    expect(metadata.values.get("draft")).toBe(true);
  });

  it("preserves keys Tsumugu has no feature for", () => {
    // Discarding these would make the tool lossy about the user's own file.
    const metadata = toDocumentMetadata([
      ["audience", "internal"],
      ["review-by", "2026-09-01"],
    ]);

    expect(metadata.values.get("audience")).toBe("internal");
    expect(metadata.values.get("review-by")).toBe("2026-09-01");
  });

  it("lets a later entry win, so callers control precedence by order", () => {
    const metadata = toDocumentMetadata([
      ["title", "from the filename"],
      ["Title", "from the front matter"],
    ]);

    expect(metadata.values.get("title")).toBe("from the front matter");
    expect(metadata.values.size).toBe(1);
  });

  it("drops keys that normalize to nothing", () => {
    const metadata = toDocumentMetadata([
      ["   ", "unreachable"],
      ["", "also unreachable"],
      ["title", "kept"],
    ]);

    expect([...metadata.values.keys()]).toEqual(["title"]);
  });

  it("keeps the value types front matter can produce", () => {
    const values: readonly (readonly [string, MetadataValue])[] = [
      ["title", "a string"],
      ["order", 3],
      ["draft", false],
      ["reviewer", null],
      ["tags", ["guide", "setup"]],
    ];
    const metadata = toDocumentMetadata(values);

    expect(metadata.values.get("order")).toBe(3);
    expect(metadata.values.get("reviewer")).toBeNull();
    expect(metadata.values.get("tags")).toEqual(["guide", "setup"]);
  });

  it("produces empty metadata from no entries", () => {
    expect(toDocumentMetadata([]).values.size).toBe(0);
    expect(emptyMetadata.values.size).toBe(0);
  });
});

describe("metadataString", () => {
  it("reads a string value by any casing", () => {
    const metadata = toDocumentMetadata([["Title", "Setup"]]);

    expect(metadataString(metadata, "title")).toBe("Setup");
    expect(metadataString(metadata, "TITLE")).toBe("Setup");
  });

  it("trims surrounding whitespace", () => {
    expect(
      metadataString(toDocumentMetadata([["title", "  Setup  "]]), "title"),
    ).toBe("Setup");
  });

  it.each([
    ["a missing key", [] as readonly (readonly [string, MetadataValue])[]],
    ["a number", [["title", 2026]] as const],
    ["a boolean", [["title", true]] as const],
    ["null", [["title", null]] as const],
    ["a list", [["title", ["a"]]] as const],
    ["an empty string", [["title", ""]] as const],
    ["only whitespace", [["title", "   "]] as const],
  ])("returns undefined for %s", (_label, entries) => {
    // Front matter is untyped: `title: 2026` parses as a number. Callers get a
    // usable string or nothing, rather than re-checking the union everywhere.
    expect(
      metadataString(toDocumentMetadata(entries), "title"),
    ).toBeUndefined();
  });
});
