import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startDev, type DevOptions, type DevResult } from "tsumugu";

import {
  withTemporaryDirectory,
  writeFiles,
} from "./helpers/temporary-directory.js";

/**
 * Watch mode, end to end.
 *
 * A file changes on disk and the served page changes with it, without the
 * server restarting. These tests wait for the rebuild the way a person does —
 * by asking the server again — rather than by reaching into the pipeline, so
 * they prove the thing that matters instead of the thing that is easy to
 * observe.
 */

let running: DevResult | undefined;

afterEach(async () => {
  // A backstop. `withProject` closes inside the temporary directory's
  // lifetime; this only fires when a test bypassed the helper.
  await running?.server.close();
  running = undefined;
});

/**
 * A served project inside a temporary directory.
 *
 * The server — and with it the file watcher — is closed in a `finally`
 * *inside* the directory's lifetime, not in `afterEach`. The order matters on
 * Windows: deleting a directory that is still being watched crashes the
 * process inside libuv, below anything JavaScript can catch, so the watcher
 * must die before the directory does even when an assertion has already
 * failed.
 */
async function withProject(
  files: Readonly<Record<string, string>>,
  options: Partial<DevOptions>,
  run: (root: string, result: DevResult) => Promise<void>,
): Promise<void> {
  await withTemporaryDirectory(async (root) => {
    await writeFiles(root, files);
    running = await startDev({ root, port: 0, ...options });

    try {
      await run(root, running);
    } finally {
      await running?.server.close();
      running = undefined;
    }
  });
}

/**
 * Fetches until the page matches, or gives up.
 *
 * File-system events arrive when the platform decides they do, so a fixed wait
 * would be either slow or flaky, and this is neither.
 */
async function eventually(
  url: string,
  matches: (html: string) => boolean,
  attempts = 60,
): Promise<string> {
  let last = "";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url);
    last = await response.text();
    if (matches(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(
    `the page never matched. Last response:\n${last.slice(0, 400)}`,
  );
}

/** Reads the event stream until `marker` arrives, or gives up. */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
  marker: string,
  attempts = 60,
): Promise<string> {
  if (reader === undefined) {
    throw new Error("the response had no body to read");
  }

  const decoder = new TextDecoder();
  let seen = "";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    seen += decoder.decode(chunk.value, { stream: true });
    if (seen.includes(marker)) {
      return seen;
    }
  }

  throw new Error(`the stream never sent "${marker}". Saw:\n${seen}`);
}

describe("watch mode", () => {
  it("serves an edit without restarting", async () => {
    await withProject({ "index.md": "# First\n" }, {}, async (root, result) => {
      expect(await (await fetch(result.server.url)).text()).toContain("First");

      await writeFile(path.join(root, "index.md"), "# Second\n");

      expect(
        await eventually(result.server.url, (html) => html.includes("Second")),
      ).not.toContain("First");
    });
  });

  it("routes a file that did not exist when the server started", async () => {
    await withProject({ "index.md": "# Home\n" }, {}, async (root, result) => {
      expect((await fetch(`${result.server.url}later`)).status).toBe(404);

      await writeFile(path.join(root, "later.md"), "# Added later\n");
      await eventually(`${result.server.url}later`, (html) =>
        html.includes("Added later"),
      );

      // It is in the navigation too, not only routable: a page nobody can find
      // is only half added.
      expect(await (await fetch(result.server.url)).text()).toContain(
        'href="/later"',
      );
    });
  });

  it("updates only the affected locale scope through the watcher", async () => {
    await withProject(
      {
        "index.md": "# Shared\n",
        "ja/index.md": "# 日本語\n",
        "en/index.md": "# English\n",
      },
      { locales: ["ja", "en"] },
      async (root, result) => {
        await writeFile(path.join(root, "ja", "guide.md"), "# 日本語ガイド\n");

        const japanese = await eventually(
          `${result.server.url}ja`,
          (html) =>
            html.includes("日本語ガイド") && !html.includes('href="/en/guide"'),
        );
        expect(japanese).toContain('href="/ja/guide"');
        expect(await (await fetch(result.server.url)).text()).not.toContain(
          "日本語ガイド",
        );

        await eventually(`${result.server.url}ja/search.json`, (body) =>
          body.includes("日本語ガイド"),
        );
      },
    );
  });

  it("stops serving a file that was deleted", async () => {
    await withProject(
      { "index.md": "# Home\n", "temporary.md": "# Temporary\n" },
      {},
      async (root, result) => {
        expect((await fetch(`${result.server.url}temporary`)).status).toBe(200);

        await rm(path.join(root, "temporary.md"));

        const url = `${result.server.url}temporary`;
        for (let attempt = 0; attempt < 60; attempt += 1) {
          if ((await fetch(url)).status === 404) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        expect((await fetch(url)).status).toBe(404);
        expect(await (await fetch(result.server.url)).text()).not.toContain(
          "Temporary",
        );
      },
    );
  });

  it("updates the navigation when a title changes", async () => {
    await withProject(
      { "index.md": "# Home\n", "guide.md": "# Old title\n" },
      {},
      async (root, result) => {
        await writeFile(path.join(root, "guide.md"), "# New title\n");

        // The sidebar is on every page, so a title change has to reach the
        // home page as well as the page that changed.
        expect(
          await eventually(result.server.url, (html) =>
            html.includes("New title"),
          ),
        ).not.toContain("Old title");
      },
    );
  });

  it("only re-renders what changed", async () => {
    await withProject(
      { "index.md": "# Home\n", "one.md": "# One\n", "two.md": "# Two\n" },
      { watch: false },
      async (root, result) => {
        const summary = await result.site.update();

        // Nothing changed on disk, so nothing was parsed, transformed or
        // themed again — the whole claim incremental rebuilding makes.
        expect(summary).toMatchObject({ rendered: 0, reused: 3, removed: 0 });

        await writeFile(path.join(root, "one.md"), "# One, edited\n");
        const afterEdit = await result.site.update();

        expect(afterEdit).toMatchObject({ rendered: 1, reused: 2, removed: 0 });
      },
    );
  });

  it("keeps serving when a document becomes unrenderable", async () => {
    await withProject(
      { "index.md": "# Home\n", "notes.md": "# Notes\n" },
      { watch: false },
      async (root, result) => {
        // Front matter that is not valid YAML: a warning on that document, and
        // nothing at all for the pages around it.
        await writeFile(
          path.join(root, "notes.md"),
          "---\ntitle: [unclosed\n---\n\n# Notes\n",
        );
        await result.site.update();

        expect((await fetch(`${result.server.url}notes`)).status).toBe(200);
        expect((await fetch(result.server.url)).status).toBe(200);
      },
    );
  });

  it("keeps serving the last version that built when the root disappears", async () => {
    await withProject(
      { "index.md": "# Still here\n" },
      { watch: false },
      async (root, result) => {
        await rm(root, { recursive: true, force: true });

        // The update fails; the pages it would have replaced are untouched.
        await expect(result.site.update()).rejects.toThrow();
        const response = await fetch(result.server.url);

        expect(response.status).toBe(200);
        expect(await response.text()).toContain("Still here");
      },
    );
  });

  it("recovers once the mistake is fixed", async () => {
    await withProject(
      { "index.md": "# First\n" },
      { watch: false },
      async (root, result) => {
        await writeFile(
          path.join(root, "index.md"),
          "---\nnot: [valid yaml\n---\n\n# Broken\n",
        );
        await result.site.update();

        // A document that cannot be parsed is a warning on that page, not a
        // server that stops answering.
        expect((await fetch(result.server.url)).status).toBe(200);

        await writeFile(path.join(root, "index.md"), "# Fixed\n");
        await result.site.update();

        expect(await (await fetch(result.server.url)).text()).toContain(
          "Fixed",
        );
      },
    );
  });

  it("tells an open browser to reload after a rebuild", async () => {
    await withProject({ "index.md": "# First\n" }, {}, async (root, result) => {
      const stream = await fetch(`${result.server.url}__tsumugu__/reload`);
      expect(stream.headers.get("content-type")).toBe("text/event-stream");

      const reader = stream.body?.getReader();
      expect(reader).toBeDefined();

      await writeFile(path.join(root, "index.md"), "# Second\n");

      // The event is what a browser listens for; the page reloading is the
      // browser's job, and not something a test can claim to have proven.
      const received = await readUntil(reader, "event: reload");
      expect(received).toContain("event: reload");

      await reader?.cancel();
    });
  });

  it("adds the reload script, and nothing beyond the two Tsumugu ships", async () => {
    await withProject(
      { "index.md": "# Home\n\nSomething to search.\n" },
      {},
      async (_root, result) => {
        const html = await (await fetch(result.server.url)).text();

        // The page client on every page, live reload only here: two, no more.
        expect(html.match(/<script/gu)).toHaveLength(2);
        expect(html).toContain("EventSource");
      },
    );
  });

  it("leaves the reload script out when live reload is off", async () => {
    await withProject(
      { "index.md": "# Home\n\nSomething to search.\n" },
      { liveReload: false },
      async (_root, result) => {
        const html = await (await fetch(result.server.url)).text();

        expect(html).not.toContain("EventSource");
        expect(html.match(/<script/gu)).toHaveLength(1);
      },
    );
  });

  it("releases the watcher when the server closes", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "index.md": "# Home\n" });
      const result = await startDev({ root, port: 0 });
      await result.server.close();

      // Writing after the close must not reach a watcher that no longer
      // exists, and the process must be free to exit.
      await writeFile(path.join(root, "index.md"), "# Changed\n");
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(fetch(result.server.url)).rejects.toThrow();
    });
  });
});
