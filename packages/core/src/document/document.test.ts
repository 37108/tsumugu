import { describe, expect, it } from "vitest";

import type { DocumentDiagnostic } from "./diagnostics.js";
import { toDocumentMetadata } from "./metadata.js";
import { toRoutePath, type RoutePath } from "./paths.js";
import {
  discoverDocument,
  documentCodes,
  hashContent,
  isStatUnchanged,
  loadDocument,
  withDiagnostics,
  type DiscoveredDocument,
  type Document,
  type FileStat,
} from "./document.js";

const stat: FileStat = { size: 128, modifiedAtMs: 1_772_000_000_000 };

function route(value: string): RoutePath {
  const result = toRoutePath(value);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function discover(path: string, fileStat: FileStat = stat): DiscoveredDocument {
  const result = discoverDocument(path, fileStat);
  if (!result.ok) {
    throw new Error(result.diagnostic.message);
  }
  return result.value;
}

describe("discoverDocument", () => {
  it("represents a file before it has been read", () => {
    const document = discover("docs/guide/setup.md");

    expect(document).toEqual({
      stage: "discovered",
      id: "docs/guide/setup.md",
      sourcePath: "docs/guide/setup.md",
      format: "markdown",
      stat,
    });
  });

  it("gives Markdown and HTML the same shape", () => {
    // One model for every format is the point: routing, metadata and caching
    // must not learn where a document came from.
    const markdown = discover("docs/a.md");
    const html = discover("docs/a.html");

    expect(Object.keys(markdown).sort()).toEqual(Object.keys(html).sort());
    expect(markdown.format).toBe("markdown");
    expect(html.format).toBe("html");
  });

  it("normalizes Windows separators into one identity", () => {
    expect(discover("docs\\guide\\setup.md").id).toBe(
      discover("docs/guide/setup.md").id,
    );
  });

  it("reports an unrepresentable path as an error diagnostic", () => {
    const result = discoverDocument("../outside.md", stat);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostic.code).toBe(documentCodes.invalidSourcePath);
    expect(result.diagnostic.severity).toBe("error");
  });

  it("reports an unsupported file as a warning, not an error", () => {
    // A PNG beside the documentation is normal, not a mistake worth failing on.
    const result = discoverDocument("docs/diagram.png", stat);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostic.code).toBe(documentCodes.unsupportedFormat);
    expect(result.diagnostic.severity).toBe("warning");
    expect(result.diagnostic.sourcePath).toBe("docs/diagram.png");
  });
});

describe("loadDocument", () => {
  it("carries identity across the stage boundary", () => {
    const discovered = discover("docs/a.md");
    const loaded = loadDocument(discovered, {
      content: "# Title\n",
      route: route("/a"),
    });

    expect(loaded.stage).toBe("loaded");
    expect(loaded.id).toBe(discovered.id);
    expect(loaded.sourcePath).toBe(discovered.sourcePath);
    expect(loaded.format).toBe(discovered.format);
    expect(loaded.stat).toEqual(discovered.stat);
  });

  it("defaults to empty metadata and no diagnostics", () => {
    const loaded = loadDocument(discover("docs/a.md"), {
      content: "",
      route: route("/a"),
    });

    expect(loaded.metadata.values.size).toBe(0);
    expect(loaded.diagnostics).toEqual([]);
  });

  it("keeps supplied metadata and deduplicates supplied diagnostics", () => {
    const diagnostic: DocumentDiagnostic = {
      code: "test/one",
      severity: "warning",
      message: "noticed twice",
    };

    const loaded = loadDocument(discover("docs/a.md"), {
      content: "body",
      route: route("/a"),
      metadata: toDocumentMetadata([["title", "A"]]),
      diagnostics: [diagnostic, diagnostic],
    });

    expect(loaded.metadata.values.get("title")).toBe("A");
    expect(loaded.diagnostics).toEqual([diagnostic]);
  });

  it("keeps the document when loading found problems", () => {
    // A file that failed to parse must still be a record, so the server can
    // explain the failure on the page the user is looking at.
    const loaded = loadDocument(discover("docs/broken.md"), {
      content: "---\nnot: [valid\n---\n",
      route: route("/broken"),
      diagnostics: [
        { code: "test/bad-front-matter", severity: "error", message: "bad" },
      ],
    });

    expect(loaded.content).not.toBe("");
    expect(loaded.diagnostics).toHaveLength(1);
  });
});

describe("hashContent", () => {
  it("is stable for identical content", () => {
    expect(hashContent("# Title\n")).toBe(hashContent("# Title\n"));
  });

  it("changes when the content changes", () => {
    expect(hashContent("# Title\n")).not.toBe(hashContent("# Title \n"));
  });

  it("distinguishes content that differs only in line endings", () => {
    // A CRLF checkout is genuinely different bytes; treating it as unchanged
    // would leave a stale page after a line-ending conversion.
    expect(hashContent("a\nb")).not.toBe(hashContent("a\r\nb"));
  });

  it("hashes the empty document without failing", () => {
    expect(hashContent("")).toHaveLength(64);
  });
});

describe("withDiagnostics", () => {
  const base = loadDocument(discover("docs/a.md"), {
    content: "body",
    route: route("/a"),
  });

  it("returns the same document when there is nothing to add", () => {
    expect(withDiagnostics(base, [])).toBe(base);
  });

  it("does not modify the original", () => {
    const next = withDiagnostics(base, [
      { code: "test/x", severity: "warning", message: "later" },
    ]);

    expect(base.diagnostics).toEqual([]);
    expect(next.diagnostics).toHaveLength(1);
    expect(next.content).toBe(base.content);
    expect(next.id).toBe(base.id);
  });

  it("merges without repeating a diagnostic already present", () => {
    const diagnostic: DocumentDiagnostic = {
      code: "test/x",
      severity: "warning",
      message: "same",
    };
    const once = withDiagnostics(base, [diagnostic]);

    expect(withDiagnostics(once, [diagnostic]).diagnostics).toEqual([
      diagnostic,
    ]);
  });
});

describe("isStatUnchanged", () => {
  it("is true for identical stats", () => {
    expect(isStatUnchanged(stat, { ...stat })).toBe(true);
  });

  it("is false when the size changed", () => {
    expect(isStatUnchanged(stat, { ...stat, size: stat.size + 1 })).toBe(false);
  });

  it("is false when the modification time changed", () => {
    expect(
      isStatUnchanged(stat, { ...stat, modifiedAtMs: stat.modifiedAtMs + 1 }),
    ).toBe(false);
  });
});

describe("document stages", () => {
  it("only exposes loaded fields after narrowing", () => {
    const documents: Document[] = [
      discover("docs/a.md"),
      loadDocument(discover("docs/b.md"), {
        content: "body",
        route: route("/b"),
      }),
    ];

    // The discriminant is what makes a stage that has not happened
    // unrepresentable: there is no way to read content from a discovered
    // document, because the type does not have it.
    const contents = documents.map((document) =>
      document.stage === "loaded" ? document.content : undefined,
    );

    expect(contents).toEqual([undefined, "body"]);
  });
});
