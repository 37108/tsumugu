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
