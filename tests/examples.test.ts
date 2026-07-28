import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startDev, type DevResult } from "tsumugu";

import { repositoryRoot } from "./helpers/paths.js";

/**
 * The example projects, served on every run.
 *
 * They exist for people to read, and reading a broken example teaches the wrong
 * thing. Serving them here means an example that stops working is a failing
 * test rather than a surprise for whoever opens it next — and it gives the
 * pipeline a fixture nobody wrote for a test, which is where the awkward cases
 * live: an HTML page beside Markdown, a hidden document, an SVG, front matter
 * that orders a section.
 */

let running: DevResult | undefined;

afterEach(async () => {
  await running?.server.close();
  running = undefined;
});

function example(name: string): string {
  return path.join(repositoryRoot, "examples", name);
}

describe("examples/minimal", () => {
  it("serves its one document at the root", async () => {
    running = await startDev({
      root: example("minimal"),
      port: 0,
      watch: false,
    });

    const response = await fetch(running.server.url);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("A minimal project");
    expect(running.diagnostics).toEqual([]);
  });
});

describe("examples/handbook", () => {
  it("reports nothing wrong with it", async () => {
    running = await startDev({
      root: example("handbook"),
      port: 0,
      watch: false,
    });

    // Every diagnostic here is a real problem in the example somebody will
    // read — except the MDX policy warnings, which the MDX page exists to
    // demonstrate. Fix the example rather than the assertion.
    expect(
      running.diagnostics
        .filter(
          (diagnostic) =>
            // Both layers report the MDX islands: the renderer preserving
            // them, and the theme presenting what was preserved.
            diagnostic.code !== "renderer-markdown/unsupported-construct" &&
            diagnostic.code !== "theme/unsupported-node",
        )
        .map(
          (diagnostic) => `${diagnostic.sourcePath ?? "-"}: ${diagnostic.code}`,
        ),
    ).toEqual([]);
  });

  it("serves Markdown and HTML through the same pipeline", async () => {
    running = await startDev({
      root: example("handbook"),
      port: 0,
      watch: false,
    });

    const markdown = await (
      await fetch(`${running.server.url}guide/getting-started`)
    ).text();
    const html = await (
      await fetch(`${running.server.url}reference/api`)
    ).text();

    // Both get the shell, the navigation and resolved heading anchors.
    expect(markdown).toContain('id="what-you-get"');
    expect(html).toContain('id="serve"');
    expect(html).toContain('<nav aria-label="Documentation"');
  });

  it("orders the guide by its front matter", async () => {
    running = await startDev({
      root: example("handbook"),
      port: 0,
      watch: false,
    });
    const home = await (await fetch(running.server.url)).text();

    const started = home.indexOf("Getting started");
    const configuration = home.indexOf("Configuration");
    expect(started).toBeGreaterThan(-1);
    expect(started).toBeLessThan(configuration);
  });

  it("keeps the hidden page reachable and unlisted", async () => {
    running = await startDev({
      root: example("handbook"),
      port: 0,
      watch: false,
    });

    expect((await fetch(`${running.server.url}drafts`)).status).toBe(200);
    expect(await (await fetch(running.server.url)).text()).not.toContain(
      "Drafts",
    );
    expect(
      await (await fetch(`${running.server.url}llms.txt`)).text(),
    ).not.toContain("Drafts");
  });

  it("serves the MDX page with its dynamic parts shown, not run", async () => {
    running = await startDev({
      root: example("handbook"),
      port: 0,
      watch: false,
    });

    const html = await (
      await fetch(`${running.server.url}guide/writing-in-mdx`)
    ).text();

    expect(html).toContain('id="why"');
    expect(html).toContain("&lt;Callout");
    expect(html).not.toContain("<Callout");
  });

  it("serves the image the guide references", async () => {
    running = await startDev({
      root: example("handbook"),
      port: 0,
      watch: false,
    });

    const response = await fetch(`${running.server.url}images/pipeline.svg`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
  });
});
