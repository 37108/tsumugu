import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startDev, type DevResult } from "tsumugu";

import { repositoryRoot } from "./helpers/paths.js";

/**
 * Tsumugu serving Tsumugu's own documentation.
 *
 * Served the way the project serves it: with the operator's `--trust`
 * declaration, because the documentation is this repository's own content and
 * two of its pages compute their figures while the page is built (ADR 7), and
 * with `--locales en,ja`, because the usage guide is written in both languages
 * and each gets its own scope (ADR 8). The `pnpm docs` script passes the same
 * options.
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

/** The project's own invocation, minus the port and the watcher. */
function serveOwnDocs(): Promise<DevResult> {
  return startDev({
    root: docsRoot,
    port: 0,
    watch: false,
    trust: true,
    locales: ["en", "ja"],
  });
}

/** Representative routes: one of each shape the project's documentation has. */
const routes = [
  "",
  "en",
  "en/how-to-use",
  "en/options",
  "ja",
  "ja/how-to-use",
  "ja/options",
  "designs/principles",
  "designs/composition",
  "designs/accessibility",
  "designs/diagnostics",
  "designs/architecture",
  "designs/architecture/semantic-ast",
  "designs/architecture/workspaces",
  "decisions/0003-live-reload-script-policy",
  "documents.json",
  "llms.txt",
  "sitemap.xml",
];

describe("Tsumugu's own documentation", () => {
  it("serves every representative route", async () => {
    running = await serveOwnDocs();

    for (const route of routes) {
      const response = await fetch(`${running.server.url}${route}`);
      expect(response.status, route).toBe(200);
    }
  });

  it("serves its own machine-readable outputs", async () => {
    running = await serveOwnDocs();

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
    running = await serveOwnDocs();

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

  it("executes the figures on its own architecture pages", async () => {
    running = await serveOwnDocs();

    for (const route of [
      "designs/architecture",
      "designs/architecture/workspaces",
    ]) {
      const html = await (await fetch(`${running.server.url}${route}`)).text();

      // The component ran: an accessible figure reached the page, and the
      // import that produced it is not sitting in the prose as source.
      expect(html, route).toContain('<svg role="img"');
      expect(html, route).not.toContain("../../.components/diagram.jsx");
      // Named for assistive technology, by the elements the audit in
      // tests/accessibility.test.ts checks the shape of.
      expect(html, route).toContain("<title id=");
      expect(html, route).toContain("<desc id=");
    }
  });

  it("builds navigation from the directories the documentation already has", async () => {
    running = await serveOwnDocs();
    const html = await (await fetch(running.server.url)).text();

    // The locale scopes are the guide, and the shared scope leaves them out:
    // what is left at the root is the design records (ADR 8).
    expect(html).not.toContain('href="/en">What is Tsumugu</a>');
    expect(html).not.toContain('href="/ja">紡ぐとは</a>');
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

  it("keeps each language of the guide in its own scope", async () => {
    running = await serveOwnDocs();

    const english = await (await fetch(`${running.server.url}en`)).text();
    const japanese = await (await fetch(`${running.server.url}ja`)).text();

    // Each scope navigates its own language and nothing else, and declares the
    // language a reader is actually looking at.
    expect(english).toContain('<html lang="en">');
    expect(english).toContain('href="/en/options">Options</a>');
    expect(english).not.toContain('href="/ja/options"');

    expect(japanese).toContain('<html lang="ja">');
    expect(japanese).toContain('href="/ja/options">オプション</a>');
    expect(japanese).not.toContain('href="/en/options"');

    // The switch between them is a link in the prose, which is the only thing
    // that knows which page translates which.
    expect(english).toContain('href="/ja"');
    expect(japanese).toContain('href="/en"');
  });

  it("draws the diagram its own usage guide contains", async () => {
    running = await serveOwnDocs();

    for (const route of ["en/how-to-use", "ja/how-to-use"]) {
      const html = await (await fetch(`${running.server.url}${route}`)).text();

      // The guide documents diagrams by containing one, so this is the feature
      // running on real documentation rather than on a fixture. Attributes are
      // matched one at a time: the serializer orders them, and asserting on a
      // whole opening tag would be asserting on that ordering.
      expect(html, route).toContain('<figure class="tsumugu-diagram">');
      expect(html, route).toContain('role="img"');
      expect(html, route).toContain("tsumugu-diagram-node");
      // Named by the author's accTitle rather than by the generated fallback.
      expect(html, route).not.toContain('aria-label="Flowchart"');
      // The page also shows a `text` block of diagram source on purpose, as
      // the example of what accTitle looks like, so the absence of source is
      // not what is asserted here — the presence of the drawing is.
    }
  });

  it("takes the site's name from the home page rather than the directory", async () => {
    running = await serveOwnDocs();
    const html = await (await fetch(running.server.url)).text();

    // The documentation already says what the project is called; the header
    // and the browser tab use that rather than the folder it sits in.
    expect(html).toContain("<title>Tsumugu</title>");
    expect(html).toContain('class="tsumugu-brand" href="/">Tsumugu<');
  });

  it("gives every page a title of its own", async () => {
    running = await serveOwnDocs();

    // Authored pages only: each scope has its own generated search page, and
    // all of them are called "Search" by design.
    const titles = [...running.site.result.pages.values()]
      .filter((page) => page.generated !== true)
      .map((page) => page.title);

    expect(titles.length).toBeGreaterThan(10);
    expect(titles).not.toContain("");
    // Two pages with one title is a sidebar a reader cannot navigate.
    expect(new Set(titles).size).toBe(titles.length);
  });
});
