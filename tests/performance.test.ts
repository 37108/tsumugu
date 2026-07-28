import { describe, expect, it } from "vitest";

import { createSite } from "tsumugu-core";
import { createPreset } from "tsumugu-preset";

import {
  withTemporaryDirectory,
  writeFiles,
} from "./helpers/temporary-directory.js";

/**
 * The shape of the performance claim, not its size.
 *
 * Asserting milliseconds on shared hardware fails for reasons that have nothing
 * to do with the change under review, so nothing here measures time. What it
 * measures is what the pipeline reports it did: a rebuild after no change must
 * render nothing, and a rebuild after one change must render one document.
 *
 * That is the property incremental rebuilding actually promises. Real numbers
 * come from `pnpm run bench`, run by a person on a machine they can name, and
 * are recorded in `docs/designs/performance.md`.
 */

/** A project with enough documents that "all of them" is visibly wrong. */
function project(count: number): Record<string, string> {
  const files: Record<string, string> = { "index.md": "# Home\n" };

  for (let index = 0; index < count; index += 1) {
    files[`section-${String(index % 3)}/document-${String(index)}.md`] = [
      `# Document ${String(index)}`,
      "",
      "Some prose.",
      "",
      "## Install",
      "",
      "```ts",
      `const answer = ${String(index)};`,
      "```",
      "",
    ].join("\n");
  }

  return files;
}

describe("incremental rebuilds", () => {
  it("renders nothing when nothing changed", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, project(20));
      const site = await createSite({ root, ...createPreset() });

      const summary = await site.update();

      expect(summary.rendered).toBe(0);
      expect(summary.reused).toBe(21);
    });
  });

  it("renders one document when one changed", async () => {
    await withTemporaryDirectory(async (root) => {
      const files = project(20);
      await writeFiles(root, files);
      const site = await createSite({ root, ...createPreset() });

      await writeFiles(root, {
        "section-0/document-0.md": "# Document 0\n\nEdited.\n",
      });
      const summary = await site.update();

      expect(summary.rendered).toBe(1);
      expect(summary.reused).toBe(20);
    });
  });

  it("reuses the serialized pages a change did not touch", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, project(20));
      const site = await createSite({ root, ...createPreset() });

      const before = [...site.result.pages.values()].map((page) => page.html);
      await site.update();
      const after = [...site.result.pages.values()].map((page) => page.html);

      // Identical by reference: the strings were not produced again. Before the
      // page cache existed, every page in the project was serialized on every
      // save, because every page carries the navigation.
      expect(after.every((html, index) => html === before[index])).toBe(true);
    });
  });

  it("rebuilds every page when the navigation changes", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, project(5));
      const site = await createSite({ root, ...createPreset() });
      const before = site.result.pages.get("/" as never)?.html ?? "";

      // A title change moves the sidebar, which is on every page.
      await writeFiles(root, {
        "section-0/document-0.md": "# A different title\n",
      });
      await site.update();

      expect(site.result.pages.get("/" as never)?.html).not.toBe(before);
      expect(site.result.pages.get("/" as never)?.html).toContain(
        "A different title",
      );
    });
  });
});
