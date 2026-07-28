import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startDev, type DevResult } from "tsumugu";

import { repositoryRoot } from "./helpers/paths.js";

/**
 * Tsumugu serving Tsumugu's own documentation.
 *
 * This is the only test whose fixture is the real project: `docs/` as it is
 * written, through the official preset, with nothing arranged for the test. It
 * is what turns "the pipeline works" into "the pipeline works on the
 * documentation somebody actually wrote", and it is where a missing feature
 * shows up first — a link convention that cannot be served, a heading that
 * cannot be addressed, a page that ends up with no title.
 *
 * It is deliberately shallow about content. Asserting on the words in a
 * document would make every edit to the documentation a test failure; these
 * assert on the things that must stay true whatever the documentation says.
 */

let running: DevResult | undefined;

afterEach(async () => {
  await running?.server.close();
  running = undefined;
});

const docsRoot = path.join(repositoryRoot, "docs");

/** Representative routes: one of each shape the project's documentation has. */
const routes = [
  "",
  "how-to-use",
  "japanese/about",
  "designs/principles",
  "designs/composition",
  "designs/accessibility",
  "designs/diagnostics",
  "designs/architecture",
  "designs/architecture/semantic-ast",
  "decisions/0003-live-reload-script-policy",
  "documents.json",
  "llms.txt",
  "sitemap.xml",
];

describe("Tsumugu's own documentation", () => {
  it("serves every representative route", async () => {
    running = await startDev({ root: docsRoot, port: 0, watch: false });

    for (const route of routes) {
      const response = await fetch(`${running.server.url}${route}`);
      expect(response.status, route).toBe(200);
    }
  });

  it("serves its own machine-readable outputs", async () => {
    running = await startDev({ root: docsRoot, port: 0, watch: false });

    const corpus = (await (
      await fetch(`${running.server.url}documents.json`)
    ).json()) as { readonly documents: readonly { readonly title: string }[] };

    expect(corpus.documents.length).toBeGreaterThan(10);
    expect(
      (await (await fetch(`${running.server.url}llms.txt`)).text()).startsWith(
        "# Tsumugu",
      ),
    ).toBe(true);
  });

  it("reports nothing wrong with the project's own documentation", async () => {
    running = await startDev({ root: docsRoot, port: 0, watch: false });

    // Every diagnostic here is a real problem in this repository's docs: a
    // broken link, a heading two pages both claim, front matter that does not
    // parse. Fix the document rather than the assertion.
    expect(
      running.diagnostics.map(
        (diagnostic) =>
          `${diagnostic.sourcePath ?? "-"}: ${diagnostic.code} ${diagnostic.message}`,
      ),
    ).toEqual([]);
  });

  it("builds navigation from the directories the documentation already has", async () => {
    running = await startDev({ root: docsRoot, port: 0, watch: false });
    const html = await (await fetch(running.server.url)).text();

    expect(html).toContain('href="/what-is-tsumugu">What is Tsumugu</a>');
    expect(html).toContain('href="/how-to-use">How to Use</a>');
    expect(html).toContain(
      'href="/japanese">Japanese Contents</a><ul><li><a href="/japanese/about">紡ぐとは</a></li><li><a href="/japanese/how-to-use">使い方</a>',
    );
    expect(html).toContain(
      'href="/designs">Designs</a><ul><li><a href="/designs/accessibility">Accessibility</a>',
    );
    expect(html).toContain('href="/designs/architecture"');
    expect(html).toContain('href="/designs/security-model">Security model</a>');
    expect(html).toContain('href="/designs/testing">Testing</a>');
    expect(html).toContain('href="/decisions">Decisions</a>');
    expect(html).toContain('href="/rfcs">RFCs</a>');
    expect(html).toContain(
      'href="/decisions/0001-runtime-and-package-compatibility"',
    );
    expect(html).not.toContain('href="/rfcs/0000-template"');
    // The authored index replaced the generated landing page.
    expect(html).not.toContain("to write your own");
  });

  it("takes the site's name from the home page rather than the directory", async () => {
    running = await startDev({ root: docsRoot, port: 0, watch: false });
    const html = await (await fetch(running.server.url)).text();

    // The documentation already says what the project is called; the header
    // and the browser tab use that rather than the folder it sits in.
    expect(html).toContain("<title>Tsumugu</title>");
    expect(html).toContain('class="tsumugu-brand" href="/">Tsumugu<');
  });

  it("gives every page a title of its own", async () => {
    running = await startDev({ root: docsRoot, port: 0, watch: false });

    const titles = [...running.site.result.pages.values()].map(
      (page) => page.title,
    );

    expect(titles.length).toBeGreaterThan(10);
    expect(titles).not.toContain("");
    // Two pages with one title is a sidebar a reader cannot navigate.
    expect(new Set(titles).size).toBe(titles.length);
  });
});
