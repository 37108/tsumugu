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
  options: {
    readonly trust?: boolean;
    readonly locales?: readonly string[];
    readonly lang?: string;
    readonly viewportWidth?: number;
  } = {},
): Promise<AxeResults> {
  let results: AxeResults | undefined;

  await withTemporaryDirectory(async (root) => {
    await writeFiles(root, files);
    running = await startDev({
      root,
      port: 0,
      watch: false,
      ...(options.trust === true ? { trust: true } : {}),
      ...(options.locales === undefined ? {} : { locales: options.locales }),
      ...(options.lang === undefined ? {} : { lang: options.lang }),
    });

    const html = await (await fetch(`${running.server.url}${path}`)).text();
    if (options.viewportWidth !== undefined) {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: options.viewportWidth,
      });
    }

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

  it.each([
    ["narrow", 320],
    ["wide", 1440],
  ] as const)(
    "finds no violations on a localized document at a %s viewport",
    async (_name, viewportWidth) => {
      const results = await audit(
        {
          "index.md": "# Shared\n",
          "ja/index.md": "# 日本語\n",
          "ja/guide.md": "# ガイド\n",
          "en/index.md": "# English\n",
        },
        "ja/guide",
        { locales: ["ja", "en"], lang: "fr", viewportWidth },
      );

      expect(document.documentElement.lang).toBe("ja");
      expect(
        document.querySelector(".tsumugu-search")?.getAttribute("action"),
      ).toBe("/ja/search");
      expect(
        document
          .querySelector('label[for="tsumugu-search-input"]')
          ?.getAttribute("lang"),
      ).toBe("en");
      expect(
        document.querySelector(".tsumugu-skip")?.getAttribute("lang"),
      ).toBe("en");
      expect(
        document.getElementById("tsumugu-search-status")?.getAttribute("lang"),
      ).toBe("en");
      expect(describeViolations(results.violations)).toEqual([]);
    },
  );

  it.each([
    ["narrow", 320],
    ["wide", 1440],
  ] as const)(
    "finds no violations on a localized generated home at a %s viewport",
    async (_name, viewportWidth) => {
      const results = await audit(
        {
          "index.md": "# Shared\n",
          "ja/guide.md": "# ガイド\n",
          "en/index.md": "# English\n",
        },
        "ja",
        { locales: ["ja", "en"], viewportWidth },
      );

      expect(document.documentElement.lang).toBe("ja");
      expect(document.querySelector('a[href="/ja/guide"]')).not.toBeNull();
      expect(document.querySelector("article p[lang='en']")).not.toBeNull();
      expect(describeViolations(results.violations)).toEqual([]);
    },
  );

  it.each([
    ["narrow", 320],
    ["wide", 1440],
  ] as const)(
    "finds no violations on localized search at a %s viewport",
    async (_name, viewportWidth) => {
      const results = await audit(
        {
          "index.md": "# Shared\n",
          "ja/index.md": "# 日本語\n",
          "ja/guide.md": "# ガイド\n",
          "en/index.md": "# English\n",
        },
        "ja/search",
        { locales: ["ja", "en"], viewportWidth },
      );

      expect(document.documentElement.lang).toBe("ja");
      expect(document.querySelector('a[href="/ja/guide"]')).not.toBeNull();
      expect(document.querySelector("article h1[lang='en']")).not.toBeNull();
      expect(document.querySelector("article p[lang='en']")).not.toBeNull();
      expect(describeViolations(results.violations)).toEqual([]);
    },
  );

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

  it("finds no violations on a trusted page carrying a figure", async () => {
    // The markup the project's own architecture pages produce: an accessible
    // figure inside a focusable scroll region, emitted as written under the
    // declaration. Written as HTML here because executing MDX needs a bundler
    // that refuses to load in this suite's DOM environment; that the
    // components produce exactly this shape is what tests/self-hosting.test.ts
    // asserts, against the real pages.
    const results = await audit(
      {
        "index.html": [
          "<h1>Diagrams</h1>",
          '<scroll-region style="display:block;overflow-x:auto" tabindex="0" role="group" aria-label="A figure">',
          '<svg role="img" aria-labelledby="f-title f-desc" viewBox="0 0 100 40">',
          '<title id="f-title">A figure</title>',
          '<desc id="f-desc">One box.</desc>',
          '<rect x="0" y="0" width="100" height="40" fill="none" stroke="currentColor" />',
          "</svg>",
          "</scroll-region>",
          "",
        ].join("\n"),
      },
      "",
      { trust: true },
    );

    expect(describeViolations(results.violations)).toEqual([]);
    // Emitted as written rather than shown as source.
    expect(document.querySelector('svg[role="img"]')).not.toBeNull();
  });

  it("finds no violations on a page with a diagram Tsumugu drew", async () => {
    for (const viewportWidth of [360, 1280]) {
      const results = await audit(
        {
          "index.md": [
            "# Pipeline",
            "",
            "```mermaid",
            "graph LR",
            "  accTitle: Pipeline stages",
            "  A[Scanner] --> B{Trusted?}",
            "  B -->|yes| C((Execute))",
            "```",
            "",
          ].join("\n"),
        },
        "",
        { viewportWidth },
      );

      expect(
        describeViolations(results.violations),
        `width ${viewportWidth}`,
      ).toEqual([]);
    }

    // Named for assistive technology, and reachable by keyboard so the figure
    // can be scrolled without a mouse.
    const figure = document.querySelector('svg[role="img"]');
    expect(figure?.getAttribute("aria-label")).toBe("Pipeline stages");
    expect(
      document.querySelector('.tsumugu-diagram-scroll[tabindex="0"]'),
    ).not.toBeNull();
  });

  it("tells assistive technology which navigation entry is the current page", async () => {
    await audit(project, "guide/setup");

    const current = document.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("href")).toBe("/guide/setup");
  });
});
