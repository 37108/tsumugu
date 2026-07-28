import { describe, expect, it } from "vitest";

import type { RoutePath, SourcePath } from "../document/paths.js";

import {
  documentsJson,
  documentsSchemaVersion,
  llmsTxt,
  sitemapXml,
} from "./outputs.js";
import { sortRecords, toRecord, type DocumentRecord } from "./records.js";

const site = { name: "Handbook", description: "How we work" };

function record(
  route: string,
  title: string,
  overrides: Partial<Parameters<typeof toRecord>[0]> = {},
): DocumentRecord {
  return toRecord({
    route: route as RoutePath,
    sourcePath: `${route === "/" ? "index" : route.slice(1)}.md` as SourcePath,
    title,
    format: "markdown",
    hidden: false,
    generated: false,
    renderable: true,
    root: {
      type: "document",
      children: [
        {
          type: "heading",
          depth: 1,
          id: "top",
          children: [{ type: "text", value: title }],
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: `About ${title}.` }],
        },
      ],
    },
    ...overrides,
  });
}

const records = sortRecords([
  record("/", "Home", { description: "Start here" }),
  record("/guide", "Guide"),
  record("/draft", "Draft", { hidden: true }),
  record("/broken", "Broken", { renderable: false }),
  record("/generated", "Generated", { generated: true }),
]);

describe("documentsJson", () => {
  it("is valid JSON with a schema version", () => {
    const parsed: unknown = JSON.parse(documentsJson(records, site));

    expect(parsed).toMatchObject({
      schemaVersion: documentsSchemaVersion,
      generator: "tsumugu",
      site: { name: "Handbook", description: "How we work" },
    });
  });

  it("includes every document, flagged rather than filtered", () => {
    const parsed = JSON.parse(documentsJson(records, site)) as {
      documents: readonly DocumentRecord[];
    };

    // A tool asking what the project contains gets the truth, and decides for
    // itself what to do with a hidden or unrenderable page.
    expect(parsed.documents.map((entry) => entry.route)).toEqual([
      "/",
      "/broken",
      "/draft",
      "/generated",
      "/guide",
    ]);
    expect(
      parsed.documents.find((entry) => entry.route === "/draft")?.hidden,
    ).toBe(true);
    expect(
      parsed.documents.find((entry) => entry.route === "/broken")?.text,
    ).toBe("");
  });

  it("carries headings and readable text from the AST", () => {
    const parsed = JSON.parse(documentsJson(records, site)) as {
      documents: readonly DocumentRecord[];
    };
    const home = parsed.documents.find((entry) => entry.route === "/");

    expect(home?.headings).toEqual([{ depth: 1, text: "Home", id: "top" }]);
    // Blocks are separated, so a heading does not run into the paragraph after
    // it when something chunks this text later.
    expect(home?.text).toBe("Home\nAbout Home.");
  });

  it("does not repeat the source, which is already on disk", () => {
    expect(documentsJson(records, site)).not.toContain('"content"');
  });

  it("produces the same bytes every time", () => {
    expect(documentsJson(records, site)).toBe(documentsJson(records, site));
  });
});

describe("llmsTxt", () => {
  it("names the project and links what it publishes", () => {
    const text = llmsTxt(records, site);

    expect(text.startsWith("# Handbook\n")).toBe(true);
    expect(text).toContain("> How we work");
    expect(text).toContain("- [Home](/): Start here");
    expect(text).toContain("- [Guide](/guide)");
  });

  it("leaves out hidden, generated and unrenderable documents", () => {
    const text = llmsTxt(records, site);

    // Listing a page here is recommending it be read, which is the opposite of
    // what `hidden` asks for.
    expect(text).not.toContain("Draft");
    expect(text).not.toContain("Generated");
    expect(text).not.toContain("Broken");
  });

  it("says it is generated, so nobody edits it by hand", () => {
    expect(llmsTxt(records, site)).toContain(
      "Edit the documents, not this file",
    );
  });

  it("invents no description for a document that has none", () => {
    const text = llmsTxt([record("/guide", "Guide")], site);

    expect(text).toContain("- [Guide](/guide)\n");
    expect(text).not.toContain("- [Guide](/guide):");
  });

  it("ends with a newline", () => {
    expect(llmsTxt(records, site).endsWith("\n")).toBe(true);
  });
});

describe("sitemapXml", () => {
  it("lists absolute URLs under the origin it was given", () => {
    const xml = sitemapXml(records, "https://docs.example.com");

    expect(xml).toContain("<loc>https://docs.example.com/</loc>");
    expect(xml).toContain("<loc>https://docs.example.com/guide</loc>");
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(sitemapXml(records, "https://docs.example.com/")).toContain(
      "<loc>https://docs.example.com/guide</loc>",
    );
  });

  it("includes a generated page and excludes hidden and broken ones", () => {
    const xml = sitemapXml(records, "https://example.com");

    // The generated landing page is a real route somebody can open.
    expect(xml).toContain("/generated");
    expect(xml).not.toContain("/draft");
    expect(xml).not.toContain("/broken");
  });

  it("emits no unescaped ampersand for an awkward route", () => {
    const xml = sitemapXml(
      [record("/a&b", "Ampersand")],
      "https://example.com",
    );

    // The route is percent-encoded on its way into a URL, so an ampersand
    // never reaches the XML — and the escaping is still there for anything
    // that does.
    expect(xml).toContain("/a%26b");
    expect(xml).not.toMatch(/&(?!amp;|apos;|quot;|lt;|gt;)/u);
  });

  it("is well-formed and declares the sitemap namespace", () => {
    const xml = sitemapXml(records, "https://example.com");

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    expect((xml.match(/<url>/gu) ?? []).length).toBe(
      (xml.match(/<\/url>/gu) ?? []).length,
    );
  });
});
