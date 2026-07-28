import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { startDev, type DevResult } from "@tsumugu/cli";

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
  await running?.server.close();
  running = undefined;
});

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
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "index.md": "# First\n" });
      running = await startDev({ root, port: 0 });

      expect(await (await fetch(running.server.url)).text()).toContain("First");

      await writeFile(path.join(root, "index.md"), "# Second\n");

      expect(
        await eventually(running.server.url, (html) => html.includes("Second")),
      ).not.toContain("First");
    });
  });

  it("routes a file that did not exist when the server started", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "index.md": "# Home\n" });
      running = await startDev({ root, port: 0 });

      expect((await fetch(`${running.server.url}later`)).status).toBe(404);

      await writeFile(path.join(root, "later.md"), "# Added later\n");
      await eventually(`${running.server.url}later`, (html) =>
        html.includes("Added later"),
      );

      // It is in the navigation too, not only routable: a page nobody can find
      // is only half added.
      expect(await (await fetch(running.server.url)).text()).toContain(
        'href="/later"',
      );
    });
  });

  it("stops serving a file that was deleted", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": "# Home\n",
        "temporary.md": "# Temporary\n",
      });
      running = await startDev({ root, port: 0 });

      expect((await fetch(`${running.server.url}temporary`)).status).toBe(200);

      await rm(path.join(root, "temporary.md"));

      const url = `${running.server.url}temporary`;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if ((await fetch(url)).status === 404) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      expect((await fetch(url)).status).toBe(404);
      expect(await (await fetch(running.server.url)).text()).not.toContain(
        "Temporary",
      );
    });
  });

  it("updates the navigation when a title changes", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": "# Home\n",
        "guide.md": "# Old title\n",
      });
      running = await startDev({ root, port: 0 });

      await writeFile(path.join(root, "guide.md"), "# New title\n");

      // The sidebar is on every page, so a title change has to reach the home
      // page as well as the page that changed.
      expect(
        await eventually(running.server.url, (html) =>
          html.includes("New title"),
        ),
      ).not.toContain("Old title");
    });
  });

  it("only re-renders what changed", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": "# Home\n",
        "one.md": "# One\n",
        "two.md": "# Two\n",
      });
      running = await startDev({ root, port: 0, watch: false });

      const summary = await running.site.update();

      // Nothing changed on disk, so nothing was parsed, transformed or themed
      // again — which is the whole claim incremental rebuilding makes.
      expect(summary).toMatchObject({ rendered: 0, reused: 3, removed: 0 });

      await writeFile(path.join(root, "one.md"), "# One, edited\n");
      const afterEdit = await running.site.update();

      expect(afterEdit).toMatchObject({ rendered: 1, reused: 2, removed: 0 });
    });
  });

  it("keeps serving when a document becomes unrenderable", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": "# Home\n",
        "notes.md": "# Notes\n",
      });
      running = await startDev({ root, port: 0, watch: false });

      // Front matter that is not valid YAML: a warning on that document, and
      // nothing at all for the pages around it.
      await writeFile(
        path.join(root, "notes.md"),
        "---\ntitle: [unclosed\n---\n\n# Notes\n",
      );
      await running.site.update();

      expect((await fetch(`${running.server.url}notes`)).status).toBe(200);
      expect((await fetch(running.server.url)).status).toBe(200);
    });
  });

  it("tells an open browser to reload after a rebuild", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "index.md": "# First\n" });
      running = await startDev({ root, port: 0 });

      const stream = await fetch(`${running.server.url}__tsumugu__/reload`);
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
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": "# Home\n\nSomething to search.\n",
      });
      running = await startDev({ root, port: 0 });

      const html = await (await fetch(running.server.url)).text();

      // Search on every page, live reload only here: two, and no more.
      expect(html.match(/<script/gu)).toHaveLength(2);
      expect(html).toContain("EventSource");
    });
  });

  it("leaves the reload script out when live reload is off", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": "# Home\n\nSomething to search.\n",
      });
      running = await startDev({ root, port: 0, liveReload: false });

      const html = await (await fetch(running.server.url)).text();

      expect(html).not.toContain("EventSource");
      expect(html.match(/<script/gu)).toHaveLength(1);
    });
  });

  it("releases the watcher when the server closes", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "index.md": "# Home\n" });
      const result = await startDev({ root, port: 0 });
      await result.server.close();

      // Writing after the close must not reach a watcher that no longer exists,
      // and the process must be free to exit.
      await writeFile(path.join(root, "index.md"), "# Changed\n");
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(fetch(result.server.url)).rejects.toThrow();
    });
  });
});
