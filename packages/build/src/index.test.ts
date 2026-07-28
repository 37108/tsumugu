import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createHeadingIdTransformer,
  element,
  fragment,
  text,
  type NodeRenderer,
  type Renderer,
  type SemanticNode,
  type Theme,
} from "@tsumugu/core";

import { buildCodes, buildStatic, fileForRoute } from "./index.js";

/**
 * The static build, against real directories.
 *
 * Every claim it makes is about files on disk, so a fake file system would test
 * the fake. The composition is deliberately minimal — one renderer, one
 * transformer, a theme that renders text — because what is under test is the
 * writing, not the rendering.
 */

let root: string;
let outDir: string;

beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), "tsumugu-build-"));
  root = path.join(base, "docs");
  outDir = path.join(base, "out");
  await mkdir(path.join(root, "guide"), { recursive: true });
  await mkdir(path.join(root, "images"), { recursive: true });

  await writeFile(path.join(root, "index.md"), "# Handbook\n\nWelcome.\n");
  await writeFile(
    path.join(root, "guide", "setup.md"),
    "# Setup\n\n## Install\n\nRun it.\n",
  );
  await writeFile(path.join(root, "images", "diagram.png"), "not really a png");
});

afterEach(async () => {
  await rm(path.dirname(root), { recursive: true, force: true });
});

/**
 * A Markdown-ish renderer: enough structure for headings and paragraphs, and
 * nothing that would make this a test of the real one.
 */
const renderer: Renderer = {
  id: "test-markdown",
  supports: (document) => document.format === "markdown",
  render: (document) => ({
    root: {
      type: "document",
      children: document.content
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) =>
          line.startsWith("#")
            ? {
                type: "heading",
                depth: line.startsWith("##") ? 2 : 1,
                children: [
                  { type: "text", value: line.replace(/^#+\s*/u, "") },
                ],
              }
            : { type: "paragraph", children: [{ type: "text", value: line }] },
        ),
    },
  }),
};

/** Renders a node's children inside `tag`, which is all this test needs. */
function wrap(tag?: string): NodeRenderer {
  return (node: SemanticNode, context) => {
    const children =
      "children" in node
        ? node.children.map((child) => context.renderChild(child))
        : [];
    return tag === undefined
      ? fragment(...children)
      : element(tag, {}, ...children);
  };
}

const theme: Theme = {
  id: "test",
  renderers: {
    document: wrap(),
    heading: wrap("h1"),
    paragraph: wrap("p"),
    text: (node) => (node.type === "text" ? text(node.value) : fragment()),
  },
};

async function build(overrides: Record<string, unknown> = {}) {
  return buildStatic({
    root,
    outDir,
    renderers: [renderer],
    transformers: [createHeadingIdTransformer()],
    theme,
    ...overrides,
  });
}

/** Every file under a directory, relative and POSIX-separated. */
async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true,
    recursive: true,
  });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(directory, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .sort();
}

describe("fileForRoute", () => {
  it.each([
    ["/", "index.html"],
    ["/guide", "guide/index.html"],
    ["/guide/setup", "guide/setup/index.html"],
  ])("writes %j to %j", (route, file) => {
    // Clean URLs: the published address is the one the development server
    // answered, so links and anchors do not differ between the two.
    expect(fileForRoute(route)).toBe(file);
  });
});

describe("buildStatic", () => {
  it("writes a page per route, the generated files, and the assets", async () => {
    const report = await build({ origin: "https://example.com" });

    expect(await listFiles(outDir)).toEqual([
      ".tsumugu-build",
      "documents.json",
      "guide/setup/index.html",
      "images/diagram.png",
      "index.html",
      "llms.txt",
      "search.json",
      "search/index.html",
      "sitemap.xml",
    ]);
    expect(report.pageCount).toBe(3);
    expect(report.assetCount).toBe(1);
  });

  it("writes the same HTML the server would have served", async () => {
    await build();

    const html = await readFile(path.join(outDir, "index.html"), "utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Handbook");
  });

  it("copies an asset byte for byte", async () => {
    await build();

    expect(
      await readFile(path.join(outDir, "images", "diagram.png"), "utf8"),
    ).toBe("not really a png");
  });

  it("puts the origin it was given into the sitemap", async () => {
    await build({ origin: "https://docs.example.com" });

    expect(await readFile(path.join(outDir, "sitemap.xml"), "utf8")).toContain(
      "<loc>https://docs.example.com/guide/setup</loc>",
    );
  });

  it("says so when no origin was given rather than inventing one", async () => {
    const report = await build();

    expect(report.diagnostics.map((entry) => entry.code)).toContain(
      buildCodes.missingOrigin,
    );
    expect(await readFile(path.join(outDir, "sitemap.xml"), "utf8")).toContain(
      "example.invalid",
    );
  });

  it("refuses to write into a directory it did not create", async () => {
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "important.txt"), "somebody's work");

    // One `--out ~/Documents` away from being a disaster.
    await expect(build()).rejects.toThrow(/not empty/u);
    expect(await listFiles(outDir)).toEqual(["important.txt"]);
  });

  it("empties a directory it wrote before, so deleted pages do not survive", async () => {
    await build();
    await writeFile(path.join(outDir, "stale", "index.html"), "old", {
      flag: "w",
    }).catch(async () => {
      await mkdir(path.join(outDir, "stale"), { recursive: true });
      await writeFile(path.join(outDir, "stale", "index.html"), "old");
    });

    await build();

    expect(await listFiles(outDir)).not.toContain("stale/index.html");
  });

  it("removes a directory it did not write when told to", async () => {
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "important.txt"), "somebody's work");

    await build({ clean: true });

    expect(await listFiles(outDir)).not.toContain("important.txt");
  });

  it("reports a collision rather than overwriting", async () => {
    // A file called `llms.txt` in the documentation root wants the same output
    // path as the generated one.
    await writeFile(path.join(root, "llms.txt"), "by hand\n");

    const report = await build();

    expect(report.diagnostics.map((entry) => entry.code)).toContain(
      buildCodes.collision,
    );
    // First writer wins, and the loser is named rather than silently dropped.
    expect(await readFile(path.join(outDir, "llms.txt"), "utf8")).not.toBe(
      "by hand\n",
    );
  });
});
