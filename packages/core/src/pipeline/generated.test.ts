import { describe, expect, it } from "vitest";

import type { RoutePath, SourcePath } from "../document/paths.js";
import { buildNavigation } from "../navigation/tree.js";
import { textContent } from "../ast/traverse.js";

import {
  generateBadRequestDocument,
  generateHomeDocument,
  generateNotFoundDocument,
} from "./generated.js";

const navigation = buildNavigation([
  {
    sourcePath: "guide/index.md" as SourcePath,
    route: "/guide" as RoutePath,
    metadata: { title: "Guide", description: "How to use it", hidden: false },
  },
  {
    sourcePath: "guide/setup.md" as SourcePath,
    route: "/guide/setup" as RoutePath,
    metadata: { title: "Setup", hidden: false },
  },
  {
    sourcePath: "draft.md" as SourcePath,
    route: "/draft" as RoutePath,
    metadata: { title: "Draft", hidden: true },
  },
]).items;

/** Every URL the document links to. */
function links(node: unknown): string[] {
  if (typeof node !== "object" || node === null) {
    return [];
  }
  const record = node as { type?: string; url?: string; children?: unknown[] };
  const own =
    record.type === "link" && record.url !== undefined ? [record.url] : [];
  const nested = (record.children ?? []).flatMap((child) => links(child));
  return [...own, ...nested];
}

describe("generateHomeDocument", () => {
  it("lists what the project contains", () => {
    const document = generateHomeDocument({
      siteName: "Docs",
      navigation,
    });

    expect(links(document)).toEqual(["/guide", "/guide/setup"]);
    expect(textContent(document)).toContain("Guide");
    expect(textContent(document)).toContain("How to use it");
  });

  it("does not list a hidden document", () => {
    expect(
      textContent(generateHomeDocument({ siteName: "Docs", navigation })),
    ).not.toContain("Draft");
  });

  it("says what to do next when there is nothing to list", () => {
    const document = generateHomeDocument({ siteName: "Docs", navigation: [] });

    expect(textContent(document)).toContain("no documents yet");
    expect(links(document)).toEqual([]);
  });

  it("titles the page after the site", () => {
    const heading = generateHomeDocument({ siteName: "Docs", navigation })
      .children[0];

    expect(heading?.type).toBe("heading");
    expect(textContent(heading as never)).toBe("Docs");
  });
});

describe("generateNotFoundDocument", () => {
  it("shows the path that was asked for", () => {
    const document = generateNotFoundDocument({
      requestedPath: "/gone",
      navigation,
    });

    expect(textContent(document)).toContain("/gone");
    expect(textContent(document)).toContain("Page not found");
  });

  it("offers the sections that do exist", () => {
    expect(
      links(generateNotFoundDocument({ requestedPath: "/gone", navigation })),
    ).toEqual(["/guide", "/guide/setup"]);
  });

  it("says so plainly when there is nothing to offer", () => {
    const document = generateNotFoundDocument({
      requestedPath: "/gone",
      navigation: [],
    });

    expect(textContent(document)).toContain("no documents to link to");
  });
});

describe("generateBadRequestDocument", () => {
  it("does not repeat the address back", () => {
    // The input failed validation, so echoing it is how a 400 page becomes a
    // reflection point.
    expect(links(generateBadRequestDocument())).toEqual(["/"]);
    expect(textContent(generateBadRequestDocument())).toContain("Bad request");
  });
});
