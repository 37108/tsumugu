import { describe, expect, it } from "vitest";

import {
  toRoutePath,
  toSourcePath,
  type RoutePath,
  type SourcePath,
} from "../document/paths.js";
import {
  decodeRequestPath,
  encodeRoutePath,
  findRouteCollisions,
  routeForSource,
  routingCodes,
} from "./routes.js";

function sourcePath(value: string): SourcePath {
  const result = toSourcePath(value);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function route(value: string): RoutePath {
  const result = toRoutePath(value);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function routeOf(value: string): string {
  const result = routeForSource(sourcePath(value));
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.route;
}

describe("routeForSource", () => {
  it.each([
    ["index.md", "/"],
    ["index.html", "/"],
    ["guide/index.md", "/guide"],
    ["guide/deep/index.html", "/guide/deep"],
  ])("maps the index file %s to its directory", (input, expected) => {
    expect(routeOf(input)).toBe(expected);
  });

  it.each([
    ["setup.md", "/setup"],
    ["guide/setup.md", "/guide/setup"],
    ["guide/deep/nested.md", "/guide/deep/nested"],
  ])("preserves directory structure for %s", (input, expected) => {
    expect(routeOf(input)).toBe(expected);
  });

  it.each([
    ["a.md", "/a"],
    ["a.markdown", "/a"],
    ["a.html", "/a"],
    ["a.htm", "/a"],
    ["a.MD", "/a"],
    ["a.HTML", "/a"],
  ])("removes the document extension from %s", (input, expected) => {
    // A page keeps its URL when it is converted between formats, which is what
    // HTML being a first-class input actually means in practice.
    expect(routeOf(input)).toBe(expected);
  });

  it("keeps filename prefixes", () => {
    // Deciding that "01-" is ordering rather than identity is the exact
    // counterexample in docs/designs/principles.md. Renaming the file is the explicit,
    // visible way to change the URL.
    expect(routeOf("01-install.md")).toBe("/01-install");
    expect(routeOf("guide/02_configure.md")).toBe("/guide/02_configure");
  });

  it("keeps a non-document extension as part of the name", () => {
    // The scanner never offers these, but if one arrives its extension is part
    // of the file's identity rather than a format marker to drop.
    expect(routeOf("notes.txt")).toBe("/notes.txt");
  });

  it("only removes the last extension", () => {
    expect(routeOf("release-1.2.md")).toBe("/release-1.2");
    expect(routeOf("a.html.md")).toBe("/a.html");
  });

  it("does not treat a nested index-like name as an index", () => {
    expect(routeOf("guide/index-of-terms.md")).toBe("/guide/index-of-terms");
    expect(routeOf("guide/indexes.md")).toBe("/guide/indexes");
  });

  it("treats Index.md as an index, since file systems are case-insensitive", () => {
    expect(routeOf("guide/Index.md")).toBe("/guide");
  });

  it("never emits a trailing slash except at the root", () => {
    // /guide and /guide/ are one page; a canonical form is what stops them
    // becoming two.
    expect(routeOf("guide/index.md")).toBe("/guide");
    expect(routeOf("index.md")).toBe("/");
  });

  it("never emits a Windows separator", () => {
    const result = routeForSource(sourcePath("guide\\deep\\setup.md"));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.route).toBe("/guide/deep/setup");
    expect(result.route).not.toContain("\\");
  });

  it("keeps spaces and non-ASCII names as written", () => {
    // The route holds what the author typed; encoding happens when it is
    // written into a URL, not when it is stored.
    expect(routeOf("getting started.md")).toBe("/getting started");
    expect(routeOf("ガイド/はじめに.md")).toBe("/ガイド/はじめに");
  });

  it("cannot produce a route outside the documentation root", () => {
    // toSourcePath already refuses traversal, so there is no path from a
    // source file to a route that escapes. This asserts the two halves stay
    // connected.
    expect(toSourcePath("../secrets.md").ok).toBe(false);
    expect(toSourcePath("guide/../../secrets.md").ok).toBe(false);
  });

  it("is deterministic", () => {
    expect(routeOf("guide/setup.md")).toBe(routeOf("guide/setup.md"));
  });
});

describe("encodeRoutePath", () => {
  it("leaves an ordinary route untouched", () => {
    expect(encodeRoutePath(route("/guide/setup"))).toBe("/guide/setup");
  });

  it("encodes characters that would change a URL's meaning", () => {
    // A file really can be called "a?b.md", and emitting that unencoded would
    // truncate the link at the question mark.
    expect(encodeRoutePath(route("/a?b"))).toBe("/a%3Fb");
    expect(encodeRoutePath(route("/a#b"))).toBe("/a%23b");
    expect(encodeRoutePath(route("/a%b"))).toBe("/a%25b");
    expect(encodeRoutePath(route("/getting started"))).toBe(
      "/getting%20started",
    );
  });

  it("keeps separators while encoding segments", () => {
    expect(encodeRoutePath(route("/a b/c d"))).toBe("/a%20b/c%20d");
  });

  it("encodes non-ASCII", () => {
    expect(encodeRoutePath(route("/ガイド"))).toBe(
      "/%E3%82%AC%E3%82%A4%E3%83%89",
    );
  });

  it("round-trips through decodeRequestPath", () => {
    for (const value of [
      "/guide/setup",
      "/getting started",
      "/ガイド/はじめに",
    ]) {
      expect(decodeRequestPath(encodeRoutePath(route(value)))).toBe(value);
    }
  });
});

describe("decodeRequestPath", () => {
  it("decodes a percent-encoded path", () => {
    expect(decodeRequestPath("/getting%20started")).toBe("/getting started");
  });

  it("drops a trailing slash so both spellings reach one page", () => {
    expect(decodeRequestPath("/guide/")).toBe("/guide");
    expect(decodeRequestPath("/")).toBe("/");
  });

  it("rejects traversal hidden behind percent-encoding", () => {
    // Decoding happens before validation on purpose: "%2e%2e%2f" decodes to
    // "../", and a check that ran first would wave it through.
    expect(decodeRequestPath("/%2e%2e/secrets")).toBeUndefined();
    expect(decodeRequestPath("/%2e%2e%2fsecrets")).toBeUndefined();
    expect(decodeRequestPath("/guide/../../etc/passwd")).toBeUndefined();
  });

  it("rejects a backslash, which some clients send as a separator", () => {
    expect(decodeRequestPath("/guide%5c..%5csecrets")).toBeUndefined();
  });

  it("returns undefined for a malformed escape rather than throwing", () => {
    // A bad percent-sequence is something a client sent. It must become a
    // rejected request, not a crash.
    expect(decodeRequestPath("/%")).toBeUndefined();
    expect(decodeRequestPath("/%zz")).toBeUndefined();
  });

  it("rejects a path that is not rooted", () => {
    expect(decodeRequestPath("guide/setup")).toBeUndefined();
  });
});

describe("findRouteCollisions", () => {
  function routed(sourcePathValue: string) {
    const source = sourcePath(sourcePathValue);
    const result = routeForSource(source);
    if (!result.ok) {
      throw new Error(result.message);
    }
    return { sourcePath: source, route: result.route };
  }

  it("reports nothing when every route is unique", () => {
    expect(findRouteCollisions([routed("a.md"), routed("guide/b.md")])).toEqual(
      [],
    );
  });

  it("detects a file competing with a directory index", () => {
    // The classic one: guide.md and guide/index.md both want /guide.
    const diagnostics = findRouteCollisions([
      routed("guide.md"),
      routed("guide/index.md"),
    ]);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]?.code).toBe(routingCodes.collision);
    expect(diagnostics[0]?.severity).toBe("error");
    expect(diagnostics[0]?.message).toContain("/guide");
    // The competing file is a related location rather than prose in the
    // message, so a presentation can link to it.
    expect(diagnostics[0]?.related?.[0]?.sourcePath).toBe("guide/index.md");
    expect(diagnostics[1]?.related?.[0]?.sourcePath).toBe("guide.md");
    expect(diagnostics[0]?.hint).toContain("Rename or move");
  });

  it("detects the same page written in two formats", () => {
    const diagnostics = findRouteCollisions([routed("a.md"), routed("a.html")]);

    expect(diagnostics).toHaveLength(2);
  });

  it("reports every file in a three-way collision", () => {
    const diagnostics = findRouteCollisions([
      routed("a.md"),
      routed("a.html"),
      routed("a.htm"),
    ]);

    expect(diagnostics).toHaveLength(3);
    expect(diagnostics[0]?.message).toContain("2 other file(s)");
    expect(diagnostics[0]?.related).toHaveLength(2);
  });

  it("is deterministic regardless of input order", () => {
    const forwards = findRouteCollisions([
      routed("guide.md"),
      routed("guide/index.md"),
    ]);
    const backwards = findRouteCollisions([
      routed("guide/index.md"),
      routed("guide.md"),
    ]);

    // Which page gets served must never depend on scan order, and neither
    // should the report about it.
    expect(backwards).toEqual(forwards);
  });

  it("handles an empty project", () => {
    expect(findRouteCollisions([])).toEqual([]);
  });
});
