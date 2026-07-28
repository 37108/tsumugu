// @vitest-environment jsdom
import axe, { type AxeResults, type Result } from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import { startDev, type DevResult } from "tsumugu";

import {
  withTemporaryDirectory,
  writeFiles,
} from "./helpers/temporary-directory.js";

/**
 * Automated accessibility checks over pages the real pipeline produced.
 *
 * What this proves, and what it does not:
 *
 * axe-core finds the failures a machine can be sure about — a missing
 * accessible name, a landmark used twice without one, a heading level skipped,
 * contrast below the threshold. It cannot tell whether a page makes sense when
 * it is read aloud, whether the reading order matches the visual one, or
 * whether an anchor's name is useful rather than merely present. Those are the
 * manual review in `docs/designs/accessibility.md`, and this file is not a substitute
 * for it.
 *
 * The pages are built by the server and parsed into a real DOM, so what is
 * audited is what a browser would receive: the shell, the theme's markup, the
 * navigation, the diagnostics panel, and the generated pages.
 */

let running: DevResult | undefined;

afterEach(async () => {
  await running?.server.close();
  running = undefined;
});

/** Builds a project, fetches one page, and runs axe over it. */
async function audit(
  files: Readonly<Record<string, string>>,
  path = "",
): Promise<AxeResults> {
  let results: AxeResults | undefined;

  await withTemporaryDirectory(async (root) => {
    await writeFiles(root, files);
    running = await startDev({ root, port: 0, watch: false });

    const html = await (await fetch(`${running.server.url}${path}`)).text();

    // Parsed as a whole document and transplanted, attributes and all: a
    // harness that dropped `lang` would report a failure the server does not
    // have, and one that added it would hide a failure it might.
    const parsed = new DOMParser().parseFromString(html, "text/html");
    for (const attribute of parsed.documentElement.attributes) {
      document.documentElement.setAttribute(attribute.name, attribute.value);
    }
    document.documentElement.innerHTML = parsed.documentElement.innerHTML;

    results = await axe.run(document, {
      // Colour contrast needs layout, which jsdom does not do. It is checked
      // against the stated palette in the theme's own tests and by eye in the
      // manual review; claiming it here would be claiming a check that did not
      // run.
      rules: { "color-contrast": { enabled: false } },
    });
  });

  if (results === undefined) {
    throw new Error("the audit did not run");
  }
  return results;
}

/** Formats violations so a failure names the rule and the element. */
function describeViolations(violations: readonly Result[]): string[] {
  return violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} — ${violation.nodes
        .map((node) => node.html.slice(0, 80))
        .join(", ")}`,
  );
}

const project = {
  "index.md": "# Handbook\n\nWelcome to the [guide](/guide/setup).\n",
  "guide/index.md": "# Guide\n",
  "guide/setup.md": [
    "---",
    "description: How to install it",
    "---",
    "",
    "# Setup",
    "",
    "## Install",
    "",
    "Run this:",
    "",
    "```ts",
    "const answer = 42;",
    "```",
    "",
    "| Name | Purpose |",
    "| ---- | ------- |",
    "| root | where documents live |",
    "",
    "![A diagram of the pipeline](/images/diagram.png)",
    "",
    "> A quotation.",
    "",
    "### Details",
    "",
    "- one",
    "- two",
    "",
  ].join("\n"),
  "images/diagram.png": "not really a png",
};

describe("accessibility", () => {
  it("finds no violations on a document page", async () => {
    const results = await audit(project, "guide/setup");

    expect(describeViolations(results.violations)).toEqual([]);
  });

  it("finds no violations on the generated landing page", async () => {
    const results = await audit({
      "guide/setup.md": "# Setup\n",
      "reference.md": "# Reference\n",
    });

    expect(describeViolations(results.violations)).toEqual([]);
  });

  it("finds no violations on a page reporting problems", async () => {
    const results = await audit({
      "index.md": "# Home\n\n[Nowhere](/gone)\n",
    });

    expect(describeViolations(results.violations)).toEqual([]);
  });

  it("finds no violations on the not-found page", async () => {
    const results = await audit(project, "definitely-not-here");

    expect(describeViolations(results.violations)).toEqual([]);
  });

  it("names both navigation landmarks distinctly", async () => {
    const results = await audit(project, "guide/setup");

    const names = [...document.querySelectorAll("nav")].map((nav) =>
      nav.getAttribute("aria-label"),
    );

    // Two navigation landmarks on one page are only usable if a screen reader
    // can tell them apart.
    expect(names).toEqual(["Documentation", "On this page"]);
    expect(new Set(names).size).toBe(names.length);
    expect(results.violations.map((violation) => violation.id)).not.toContain(
      "landmark-unique",
    );
  });

  it("puts a working skip link ahead of the navigation", async () => {
    await audit(project, "guide/setup");

    const skip = document.querySelector("a.tsumugu-skip");
    const target = skip?.getAttribute("href")?.slice(1) ?? "";

    expect(skip?.textContent).toBe("Skip to content");
    expect(document.getElementById(target)?.tagName).toBe("MAIN");
  });

  it("keeps the heading hierarchy the document declared", async () => {
    await audit(project, "guide/setup");

    const levels = [...document.querySelectorAll("main h1, main h2, main h3")]
      .map((heading) => Number(heading.tagName.slice(1)))
      .filter((level) => Number.isFinite(level));

    // Each heading is at most one level deeper than the one before it.
    for (const [index, level] of levels.entries()) {
      const previous = levels[index - 1];
      if (previous !== undefined) {
        expect(level).toBeLessThanOrEqual(previous + 1);
      }
    }
  });

  it("gives every heading anchor a name of its own", async () => {
    await audit(project, "guide/setup");

    const anchors = [...document.querySelectorAll("a.tsumugu-anchor")];
    const labels = anchors.map((anchor) => anchor.getAttribute("aria-label"));

    expect(anchors.length).toBeGreaterThan(0);
    // "hash, link" three times over tells a screen reader user nothing.
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      expect(label).toMatch(/^Link to /u);
    }
  });

  it("keeps the author's alternative text on images", async () => {
    await audit(project, "guide/setup");

    expect(document.querySelector("main img")?.getAttribute("alt")).toBe(
      "A diagram of the pipeline",
    );
  });

  it("marks table header cells as the columns they head", async () => {
    await audit(project, "guide/setup");

    const header = document.querySelector("main th");
    expect(header?.getAttribute("scope")).toBe("col");
  });

  it("makes scrollable regions reachable by keyboard", async () => {
    await audit(project, "guide/setup");

    // A region that scrolls and cannot be focused is a region a keyboard user
    // cannot scroll.
    expect(document.querySelector("main pre")?.getAttribute("tabindex")).toBe(
      "0",
    );
    const table = document.querySelector(".tsumugu-table-scroll");
    expect(table?.getAttribute("tabindex")).toBe("0");
    expect(table?.getAttribute("aria-label")).toBe("Table");
  });

  it("exposes search as a combobox a keyboard can drive", async () => {
    await audit(project, "guide/setup");

    const input = document.querySelector(
      '.tsumugu-search input[role="combobox"]',
    );
    const list = document.getElementById("tsumugu-search-results");

    expect(input?.getAttribute("aria-controls")).toBe("tsumugu-search-results");
    expect(input?.getAttribute("aria-expanded")).toBe("false");
    expect(list?.getAttribute("role")).toBe("listbox");
    // Labelled, not placeholder-labelled: a placeholder disappears the moment
    // somebody types.
    expect(
      document.querySelector(`label[for="${input?.id ?? ""}"]`)?.textContent,
    ).toBe("Search the documentation");
  });

  it("keeps the search field useful without JavaScript", async () => {
    await audit(project, "guide/setup");

    const form = document.querySelector(".tsumugu-search");

    // With no script, submitting goes to a real page that lists everything.
    expect(form?.getAttribute("action")).toBe("/search");
    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.getAttribute("role")).toBe("search");
  });

  it("tells assistive technology which navigation entry is the current page", async () => {
    await audit(project, "guide/setup");

    const current = document.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("href")).toBe("/guide/setup");
  });
});
