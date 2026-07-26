import { describe, expect, it } from "vitest";

import {
  detectSourceFormat,
  documentIdOf,
  toRoutePath,
  toSourcePath,
  type PathResult,
  type SourcePath,
} from "./paths.js";

function unwrap<T>(result: PathResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected a valid value, got: ${result.error.message}`);
  }
  return result.value;
}

function sourcePath(value: string): SourcePath {
  return unwrap(toSourcePath(value));
}

describe("toSourcePath", () => {
  it("keeps a normal relative path", () => {
    expect(sourcePath("docs/guide/setup.md")).toBe("docs/guide/setup.md");
  });

  it("rewrites Windows separators", () => {
    // path.relative produces this shape on Windows; it must yield the same
    // identity, route and cache key as the POSIX form.
    expect(sourcePath("docs\\guide\\setup.md")).toBe("docs/guide/setup.md");
    expect(sourcePath("docs\\guide/setup.md")).toBe("docs/guide/setup.md");
  });

  it("drops a leading current-directory segment", () => {
    expect(sourcePath("./docs/index.md")).toBe("docs/index.md");
    expect(sourcePath(".\\docs\\index.md")).toBe("docs/index.md");
  });

  it("preserves filename prefixes", () => {
    // The file system is the source of truth. Stripping "01-" would make the
    // route stop matching the file the user is editing.
    expect(sourcePath("docs/01-install.md")).toBe("docs/01-install.md");
  });

  it("preserves spaces and non-ASCII names", () => {
    expect(sourcePath("docs/getting started.md")).toBe(
      "docs/getting started.md",
    );
    expect(sourcePath("docs/はじめに.md")).toBe("docs/はじめに.md");
  });

  it.each([
    ["an empty string", "", "empty"],
    ["a POSIX absolute path", "/etc/passwd", "absolute"],
    ["a Windows absolute path", "\\Windows\\system32", "absolute"],
    ["a drive-qualified path", "C:\\Users\\me\\docs.md", "absolute"],
    ["a parent traversal", "../secrets.md", "traversal"],
    ["a nested traversal", "docs/../../secrets.md", "traversal"],
    ["an empty segment", "docs//index.md", "empty-segment"],
  ])("rejects %s", (_label, value, rejection) => {
    const result = toSourcePath(value);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.rejection).toBe(rejection);
    expect(result.error.message).not.toBe("");
  });

  it("rejects traversal even when it would resolve inside the root", () => {
    // "docs/../docs/a.md" is harmless once resolved, but accepting it means
    // accepting the syntax, and the next one may not resolve inside.
    expect(toSourcePath("docs/../docs/a.md").ok).toBe(false);
  });
});

describe("toRoutePath", () => {
  it("accepts routes rooted at /", () => {
    expect(unwrap(toRoutePath("/"))).toBe("/");
    expect(unwrap(toRoutePath("/guide/setup"))).toBe("/guide/setup");
    expect(unwrap(toRoutePath("/guide/"))).toBe("/guide/");
  });

  it.each([
    ["a relative route", "guide/setup"],
    ["a Windows separator", "/guide\\setup"],
    ["a parent segment", "/guide/../../etc/passwd"],
    ["a current segment", "/guide/./setup"],
    ["a doubled separator", "/guide//setup"],
  ])("rejects %s", (_label, value) => {
    expect(toRoutePath(value).ok).toBe(false);
  });

  it("does not accept a source path", () => {
    // The two types exist to keep these apart: serving a file because a route
    // was treated as a path is how directory traversal happens.
    expect(toRoutePath("docs/index.md").ok).toBe(false);
  });
});

describe("documentIdOf", () => {
  it("is stable for the same path however it was spelled", () => {
    expect(documentIdOf(sourcePath("docs\\a.md"))).toBe(
      documentIdOf(sourcePath("docs/a.md")),
    );
    expect(documentIdOf(sourcePath("./docs/a.md"))).toBe(
      documentIdOf(sourcePath("docs/a.md")),
    );
  });

  it("differs for different paths", () => {
    expect(documentIdOf(sourcePath("docs/a.md"))).not.toBe(
      documentIdOf(sourcePath("docs/b.md")),
    );
  });

  it("changes when a file is renamed", () => {
    // A rename is a removal and an addition. Recognising that the two events
    // describe the same file moving is a separate problem, and guessing at it
    // here would be wrong more often than it was right.
    const before = documentIdOf(sourcePath("docs/old-name.md"));
    const after = documentIdOf(sourcePath("docs/new-name.md"));

    expect(after).not.toBe(before);
  });
});

describe("detectSourceFormat", () => {
  it.each([
    ["docs/a.md", "markdown"],
    ["docs/a.markdown", "markdown"],
    ["docs/a.html", "html"],
    ["docs/a.htm", "html"],
  ])("classifies %s", (path, format) => {
    expect(detectSourceFormat(sourcePath(path))).toBe(format);
  });

  it("ignores extension case", () => {
    // macOS and Windows file systems are case-insensitive; a project must not
    // behave differently depending on which machine wrote the filename.
    expect(detectSourceFormat(sourcePath("docs/README.MD"))).toBe("markdown");
    expect(detectSourceFormat(sourcePath("docs/a.HtMl"))).toBe("html");
  });

  it.each([
    ["a file with no extension", "docs/LICENSE"],
    ["an unsupported extension", "docs/notes.txt"],
    ["an image", "docs/diagram.png"],
    ["a dotfile that looks like an extension", "docs/.md"],
  ])("returns undefined for %s", (_label, path) => {
    expect(detectSourceFormat(sourcePath(path))).toBeUndefined();
  });

  it("uses the last extension of a multi-part name", () => {
    expect(detectSourceFormat(sourcePath("docs/a.md.html"))).toBe("html");
    expect(detectSourceFormat(sourcePath("docs/a.html.md"))).toBe("markdown");
  });
});
