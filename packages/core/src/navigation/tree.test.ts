import { describe, expect, it } from "vitest";

import type { RoutePath, SourcePath } from "../document/paths.js";

import {
  buildNavigation,
  navigationTrail,
  navigationCodes,
  type NavigationDocument,
  type NavigationItem,
} from "./tree.js";

/**
 * Builds a navigation document without restating the metadata shape each time.
 * `title` defaults to the file name so a test only states what it is about.
 */
function document(
  sourcePath: string,
  route: string,
  metadata: Partial<NavigationDocument["metadata"]> = {},
): NavigationDocument {
  return {
    sourcePath: sourcePath as SourcePath,
    route: route as RoutePath,
    metadata: {
      title: metadata.title ?? sourcePath,
      hidden: metadata.hidden ?? false,
      ...(metadata.order === undefined ? {} : { order: metadata.order }),
    },
  };
}

/** The shape a reader would check: labels and nesting, without the details. */
function outline(items: readonly NavigationItem[]): unknown {
  return items.map((item) =>
    item.children.length === 0
      ? item.label
      : { [item.label]: outline(item.children) },
  );
}

describe("buildNavigation", () => {
  it("mirrors the directory structure", () => {
    const navigation = buildNavigation([
      document("index.md", "/", { title: "Home" }),
      document("guide/setup.md", "/guide/setup", { title: "Setup" }),
      document("guide/index.md", "/guide", { title: "Guide" }),
      document("reference/api.md", "/reference/api", { title: "API" }),
    ]);

    expect(outline(navigation.items)).toEqual([
      "Home",
      { Guide: ["Setup"] },
      { Reference: ["API"] },
    ]);
  });

  it("makes an index document the directory's own entry rather than a child", () => {
    const navigation = buildNavigation([
      document("guide/index.md", "/guide", { title: "Guide" }),
      document("guide/setup.md", "/guide/setup", { title: "Setup" }),
    ]);

    const guide = navigation.items[0];
    expect(guide?.label).toBe("Guide");
    expect(guide?.route).toBe("/guide");
    expect(guide?.children.map((child) => child.label)).toEqual(["Setup"]);
  });

  it("leaves a directory without an index document unlinked", () => {
    const navigation = buildNavigation([
      document("getting-started/install.md", "/getting-started/install", {
        title: "Install",
      }),
    ]);

    expect(navigation.items[0]?.label).toBe("Getting started");
    expect(navigation.items[0]?.route).toBeUndefined();
  });

  it("orders explicitly ordered documents first, ascending", () => {
    const navigation = buildNavigation([
      document("beta.md", "/beta", { title: "Beta" }),
      document("alpha.md", "/alpha", { title: "Alpha" }),
      document("last.md", "/last", { title: "Last", order: 20 }),
      document("first.md", "/first", { title: "First", order: 1 }),
    ]);

    expect(outline(navigation.items)).toEqual([
      "First",
      "Last",
      "Alpha",
      "Beta",
    ]);
  });

  it("orders a directory by its index document's order", () => {
    const navigation = buildNavigation([
      document("a-section/index.md", "/a-section", { title: "A", order: 2 }),
      document("b-section/index.md", "/b-section", { title: "B", order: 1 }),
    ]);

    expect(outline(navigation.items)).toEqual(["B", "A"]);
  });

  it("breaks ties on source path, so identical titles stay deterministic", () => {
    const navigation = buildNavigation([
      document("z.md", "/z", { title: "Same" }),
      document("a.md", "/a", { title: "Same" }),
    ]);

    expect(navigation.items.map((item) => item.sourcePath)).toEqual([
      "a.md",
      "z.md",
    ]);
  });

  it("orders Unicode titles the same way on every platform", () => {
    const navigation = buildNavigation([
      document("b.md", "/b", { title: "Ünicode" }),
      document("a.md", "/a", { title: "Zebra" }),
    ]);

    // Code-unit order, not locale collation: "Z" (U+005A) precedes "Ü" (U+00DC)
    // whatever the machine's language is.
    expect(navigation.items.map((item) => item.label)).toEqual([
      "Zebra",
      "Ünicode",
    ]);
  });

  it("omits hidden documents", () => {
    const navigation = buildNavigation([
      document("index.md", "/", { title: "Home" }),
      document("draft.md", "/draft", { title: "Draft", hidden: true }),
    ]);

    expect(outline(navigation.items)).toEqual(["Home"]);
  });

  it("omits a directory whose documents are all hidden", () => {
    const navigation = buildNavigation([
      document("index.md", "/", { title: "Home" }),
      document("drafts/one.md", "/drafts/one", { title: "One", hidden: true }),
    ]);

    expect(outline(navigation.items)).toEqual(["Home"]);
  });

  it("keeps a directory whose index is visible even when its children are hidden", () => {
    const navigation = buildNavigation([
      document("guide/index.md", "/guide", { title: "Guide" }),
      document("guide/draft.md", "/guide/draft", {
        title: "Draft",
        hidden: true,
      }),
    ]);

    expect(outline(navigation.items)).toEqual(["Guide"]);
    expect(navigation.items[0]?.route).toBe("/guide");
  });

  it("warns when two siblings share a label", () => {
    const navigation = buildNavigation([
      document("a.md", "/a", { title: "Setup" }),
      document("b.md", "/b", { title: "Setup" }),
    ]);

    const codes = navigation.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toEqual([
      navigationCodes.duplicateLabel,
      navigationCodes.duplicateLabel,
    ]);
    expect(navigation.diagnostics[0]?.related?.[0]?.sourcePath).toBe("b.md");
  });

  it("does not warn when the same label appears in different sections", () => {
    const navigation = buildNavigation([
      document("guide/setup.md", "/guide/setup", { title: "Setup" }),
      document("reference/setup.md", "/reference/setup", { title: "Setup" }),
    ]);

    expect(navigation.diagnostics).toEqual([]);
  });

  it("returns nothing for a project with no documents", () => {
    expect(buildNavigation([])).toEqual({ items: [], diagnostics: [] });
  });

  it("nests directories to any depth", () => {
    const navigation = buildNavigation([
      document("a/b/c/deep.md", "/a/b/c/deep", { title: "Deep" }),
    ]);

    expect(outline(navigation.items)).toEqual([
      { A: [{ B: [{ C: ["Deep"] }] }] },
    ]);
  });
});

describe("navigationTrail", () => {
  const navigation = buildNavigation([
    document("index.md", "/", { title: "Home" }),
    document("guide/index.md", "/guide", { title: "Guide" }),
    document("guide/setup.md", "/guide/setup", { title: "Setup" }),
  ]);

  it("names every ancestor of the current page", () => {
    expect(
      navigationTrail(navigation.items, "/guide/setup" as RoutePath).map(
        (item) => item.label,
      ),
    ).toEqual(["Guide", "Setup"]);
  });

  it("finds a directory's own page", () => {
    expect(
      navigationTrail(navigation.items, "/guide" as RoutePath).map(
        (item) => item.label,
      ),
    ).toEqual(["Guide"]);
  });

  it("is empty for a route that is not in the tree", () => {
    expect(navigationTrail(navigation.items, "/hidden" as RoutePath)).toEqual(
      [],
    );
  });
});
