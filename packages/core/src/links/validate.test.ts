import { describe, expect, it } from "vitest";

import type { RoutePath, SourcePath } from "../document/paths.js";

import type { CollectedLink } from "./collect.js";
import {
  classifyLink,
  linkCodes,
  resolveLinkPath,
  validateDocumentLinks,
  type LinkValidationTarget,
} from "./validate.js";

/** A project with two documents, one of them with a section. */
const target: LinkValidationTarget = {
  routes: new Map<RoutePath, ReadonlySet<string>>([
    ["/" as RoutePath, new Set(["welcome"])],
    ["/guide/setup" as RoutePath, new Set(["install", "配置"])],
    ["/guide/a page" as RoutePath, new Set()],
    ["/draft" as RoutePath, new Set()],
  ]),
  hasAsset: (path) =>
    ["images/diagram.png", "downloads/handbook.pdf"].includes(path),
};

/** Validates one link from one document and returns the diagnostic codes. */
function check(from: string, url: string): readonly string[] {
  const link: CollectedLink = { url, kind: "link" };

  return validateDocumentLinks(
    {
      sourcePath: from as SourcePath,
      links: [link],
      headingIds: new Set(["own-section"]),
    },
    target,
  ).map((diagnostic) => diagnostic.code);
}

describe("classifyLink", () => {
  it.each([
    ["https://example.com", "external"],
    ["http://example.com", "external"],
    ["//example.com/x", "external"],
    ["mailto:docs@example.com", "mail"],
    ["ftp://example.com/x", "other-scheme"],
    ["tel:+81312345678", "other-scheme"],
    ["#install", "fragment"],
    ["/guide/setup", "internal"],
    ["./setup.md", "internal"],
  ])("classifies %j as %s", (url, kind) => {
    expect(classifyLink(url).kind).toBe(kind);
  });

  it("separates the fragment and drops the query", () => {
    expect(classifyLink("/guide/setup?theme=dark#install")).toEqual({
      kind: "internal",
      path: "/guide/setup",
      fragment: "install",
    });
  });
});

describe("resolveLinkPath", () => {
  it.each([
    ["guide/setup.md", "./options.md", "guide/options.md"],
    ["guide/setup.md", "../index.md", "index.md"],
    ["guide/setup.md", "/reference/api", "reference/api"],
    ["index.md", "guide/setup", "guide/setup"],
  ])("resolves %j + %j", (from, path, expected) => {
    // The extension is kept: what a file name maps to is routing's decision,
    // not this function's.
    expect(resolveLinkPath(from as SourcePath, path)).toBe(expected);
  });

  it("refuses to climb above the documentation root", () => {
    expect(
      resolveLinkPath("index.md" as SourcePath, "../secrets"),
    ).toBeUndefined();
  });

  it("decodes percent-encoding, so one target has one spelling", () => {
    expect(resolveLinkPath("index.md" as SourcePath, "/guide/a%20page")).toBe(
      "guide/a page",
    );
  });
});

describe("validateDocumentLinks", () => {
  it("accepts a route the project serves", () => {
    expect(check("index.md", "/guide/setup")).toEqual([]);
  });

  it("accepts a relative link between documents", () => {
    expect(check("guide/index.md", "./setup.md")).toEqual([]);
  });

  it("accepts a link written to a file name", () => {
    expect(check("index.md", "/guide/setup.md")).toEqual([]);
  });

  it("reports a route the project does not serve", () => {
    expect(check("index.md", "/guide/gone")).toEqual([
      linkCodes.unknownDocument,
    ]);
  });

  it("keeps a hidden document a valid target", () => {
    // `hidden` means unlisted, not unreachable, so linking to one is correct.
    expect(check("index.md", "/draft")).toEqual([]);
  });

  it("accepts a fragment that exists in the target", () => {
    expect(check("index.md", "/guide/setup#install")).toEqual([]);
  });

  it("reports a fragment the target does not have", () => {
    expect(check("index.md", "/guide/setup#uninstall")).toEqual([
      linkCodes.unknownFragment,
    ]);
  });

  it("accepts a fragment outside ASCII", () => {
    expect(check("index.md", "/guide/setup#配置")).toEqual([]);
  });

  it("checks a fragment-only link against the document it is in", () => {
    expect(check("index.md", "#own-section")).toEqual([]);
    expect(check("index.md", "#nowhere")).toEqual([linkCodes.unknownFragment]);
  });

  it("ignores a query string when resolving the target", () => {
    expect(check("index.md", "/guide/setup?highlight=install")).toEqual([]);
  });

  it("accepts a percent-encoded path", () => {
    expect(check("index.md", "/guide/a%20page")).toEqual([]);
  });

  it("accepts an asset that exists", () => {
    expect(check("index.md", "/images/diagram.png")).toEqual([]);
    expect(check("guide/setup.md", "../downloads/handbook.pdf")).toEqual([]);
  });

  it("reports an asset that does not", () => {
    expect(check("index.md", "/images/missing.png")).toEqual([
      linkCodes.missingAsset,
    ]);
  });

  it("never reports an external link", () => {
    for (const url of [
      "https://example.com/gone",
      "http://example.com",
      "mailto:docs@example.com",
      "ftp://example.com/x",
    ]) {
      expect(check("index.md", url), url).toEqual([]);
    }
  });

  it("reports a link that climbs out of the root", () => {
    expect(check("index.md", "../../etc/passwd")).toEqual([
      linkCodes.unknownDocument,
    ]);
  });

  it("points at the file and position the link came from", () => {
    const diagnostics = validateDocumentLinks(
      {
        sourcePath: "guide/setup.md" as SourcePath,
        links: [
          {
            url: "/gone",
            kind: "link",
            range: {
              start: { line: 4, column: 1, offset: 30 },
              end: { line: 4, column: 12, offset: 41 },
            },
          },
        ],
        headingIds: new Set(),
      },
      target,
    );

    expect(diagnostics[0]?.sourcePath).toBe("guide/setup.md");
    expect(diagnostics[0]?.range?.start.line).toBe(4);
  });
});
