import { createHash } from "node:crypto";

import { parseDevOptions, startDev, type DevResult } from "tsumugu";
import { afterEach, describe, expect, it } from "vitest";

import {
  withTemporaryDirectory,
  writeFiles,
} from "./helpers/temporary-directory.js";

/**
 * The `--trust` declaration, end to end (ADR 7).
 *
 * The same fixture is served twice: once as every root is served, and once
 * under the operator's declaration. The difference over the wire is exactly
 * the declaration's scope — markup the Semantic AST does not model reaches
 * the page verbatim instead of as escaped source — and nothing else.
 */

let running: DevResult | undefined;

afterEach(async () => {
  await running?.server.close();
  running = undefined;
});

async function serveFixture(
  files: Readonly<Record<string, string>>,
  // The exact strings an operator would type, so the slice covers the parser
  // and the pipeline as one path rather than each proving half.
  argv: readonly string[],
  run: (result: DevResult) => void | Promise<void>,
): Promise<void> {
  await withTemporaryDirectory(async (root) => {
    await writeFiles(root, files);
    const parsed = parseDevOptions([...argv]);
    if (!parsed.ok) {
      throw new Error(parsed.message);
    }
    running = await startDev({ ...parsed.options, root, port: 0 });

    try {
      await run(running);
    } finally {
      // The watcher must die before the directory does; see the vertical
      // slice for the Windows reason. `afterEach` stays as a backstop.
      await running.server.close();
      running = undefined;
    }
  });
}

const canvasPage = [
  "<main>",
  "<h1>Demo</h1>",
  '<canvas id="chart" width="320" height="120"></canvas>',
  "</main>",
  "",
].join("\n");

describe("a root served without --trust", () => {
  it("removes author scripts and does not widen the policy", async () => {
    const body = 'document.querySelector("canvas").dataset.ready = "yes";';
    const files = {
      "demo.html": `<main><h1>Demo</h1>\n<script>${body}</script>\n</main>\n`,
    };

    await serveFixture(files, [], async ({ server }) => {
      const response = await fetch(`${server.url}demo`);
      const html = await response.text();
      const policy = response.headers.get("content-security-policy") ?? "";
      const scriptSource = /script-src ([^;]+)/.exec(policy)?.[1] ?? "";

      expect(html).not.toContain(`<script>${body}`);
      expect(scriptSource).not.toContain("'self'");
      // No author hash either: the policy without the declaration is exactly
      // the policy there has always been.
      const authorHash = `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
      expect(scriptSource).not.toContain(authorHash);
    });
  });

  it("keeps preserved markup as escaped source", async () => {
    await serveFixture({ "demo.html": canvasPage }, [], async ({ server }) => {
      const html = await (await fetch(`${server.url}demo`)).text();

      // The source is shown, escaped, inside the preserved-markup block.
      expect(html).toContain("<pre data-tsumugu-raw-html");
      expect(html).toContain("&lt;canvas");
      expect(html).not.toContain("<canvas");
    });
  });
});

describe("a root served with --trust", () => {
  it("emits preserved markup verbatim", async () => {
    await serveFixture(
      { "demo.html": canvasPage },
      ["--trust"],
      async ({ server }) => {
        const html = await (await fetch(`${server.url}demo`)).text();

        expect(html).toContain(
          '<canvas id="chart" width="320" height="120"></canvas>',
        );
        // The escaped-source block is gone; the no-semantic-equivalent
        // diagnostic may still mention the element, and should.
        expect(html).not.toContain("<pre data-tsumugu-raw-html");
      },
    );
  });

  it("emits author scripts and allows exactly them by hash", async () => {
    const body = 'document.querySelector("canvas").dataset.ready = "yes";';
    const hash = `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
    const files = {
      "demo.html": `<main><h1>Demo</h1><canvas id="chart"></canvas>\n<script>${body}</script>\n</main>\n`,
    };

    await serveFixture(files, ["--trust"], async ({ server }) => {
      const response = await fetch(`${server.url}demo`);
      const html = await response.text();
      const policy = response.headers.get("content-security-policy") ?? "";
      const scriptSource = /script-src ([^;]+)/.exec(policy)?.[1] ?? "";

      expect(html).toContain(`<script>${body}</script>`);
      // The declaration's scope, stated to the browser: this page's own
      // scripts by hash, files inside the root by 'self', nothing else.
      expect(scriptSource).toContain(hash);
      expect(scriptSource).toContain("'self'");
    });
  });

  it("collects scripts inside preserved subtrees too", async () => {
    const body = "customElements.get('x-widget');";
    const hash = `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
    const files = {
      "demo.html": `<main><x-widget><script>${body}</script></x-widget></main>\n`,
    };

    await serveFixture(files, ["--trust"], async ({ server }) => {
      const response = await fetch(`${server.url}demo`);
      const policy = response.headers.get("content-security-policy") ?? "";

      expect(await response.text()).toContain(`<script>${body}</script>`);
      expect(policy).toContain(hash);
    });
  });

  it("covers HTML embedded in Markdown", async () => {
    const body = 'console.log("hi");';
    const hash = `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
    const files = {
      "index.md": `# Guide\n\n<script>${body}</script>\n`,
    };

    await serveFixture(files, ["--trust"], async ({ server }) => {
      const response = await fetch(server.url);
      const policy = response.headers.get("content-security-policy") ?? "";

      expect(await response.text()).toContain(`<script>${body}</script>`);
      expect(policy).toContain(hash);
    });
  });

  it("leaves modeled content rendered exactly as without it", async () => {
    const page = "---\ntitle: Guide\n---\n\n# Guide\n\nHello.\n";

    await serveFixture(
      { "index.md": page },
      ["--trust"],
      async ({ server }) => {
        const html = await (await fetch(server.url)).text();

        expect(html).toContain('<h1 id="guide">Guide');
        expect(html).toContain("<p>Hello.</p>");
      },
    );
  });
});
