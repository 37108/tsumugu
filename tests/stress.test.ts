import { describe, expect, it } from "vitest";

import { createSite } from "tsumugu-core";
import { createPreset } from "tsumugu-preset";

import {
  withTemporaryDirectory,
  writeFiles,
} from "./helpers/temporary-directory.js";

/**
 * A site large enough for scale bugs to show.
 *
 * Not a benchmark — `pnpm bench` measures time, on a machine somebody can
 * name. This asserts *correctness at scale*: with several hundred documents in
 * nested directories, every counting, sorting and deduplicating structure has
 * to come out exact. An off-by-one that a five-file fixture forgives — a page
 * lost to a collision map, a search entry duplicated per rebuild, a navigation
 * sort that only looked stable — is a wrong number here.
 *
 * The counts are exact on purpose. `toBeGreaterThan` would pass while quietly
 * dropping forty documents.
 *
 * The timeout is stated, and generously, for the same reason: writing three
 * hundred files and building the site twice is slow on a cold CI runner, and
 * the default five seconds turns a correctness test into an accidental
 * deadline that fails on a busy machine rather than on a bug. `pnpm bench` is
 * where speed is measured.
 */

/** Long enough that only a hang reaches it. */
const TIMEOUT_MS = 60_000;

const DOCUMENTS = 300;
const SECTIONS = 12;

function project(): Record<string, string> {
  const files: Record<string, string> = {
    "index.md": "# Stress\n\nThe index.\n",
  };

  for (let index = 0; index < DOCUMENTS; index += 1) {
    const section = index % SECTIONS;
    files[`section-${String(section)}/document-${String(index)}.md`] = [
      "---",
      `title: Document ${String(index)}`,
      `order: ${String(index)}`,
      "---",
      "",
      `# Document ${String(index)}`,
      "",
      `Prose mentioning needle-${String(index)}.`,
      "",
      "## Details",
      "",
      `More about needle-${String(index)}.`,
      "",
      `A link to [the next one](/section-${String((index + 1) % SECTIONS)}/document-${String((index + 1) % DOCUMENTS)}).`,
      "",
    ].join("\n");
  }

  return files;
}

describe("a three-hundred-document site", () => {
  it(
    "routes, indexes and rebuilds without losing a single document",
    async () => {
      await withTemporaryDirectory(async (root) => {
        await writeFiles(root, project());
        const site = await createSite({ root, ...createPreset() });

        // Discovery and routing: every file became exactly one page, plus the
        // generated /search page and nothing else.
        expect(site.result.pages.size).toBe(DOCUMENTS + 2);
        expect(site.result.diagnostics).toEqual([]);

        // Link validation ran over every page and found the graph closed.
        const pageDiagnostics = [...site.result.pages.values()].flatMap(
          (page) => page.diagnostics,
        );
        expect(pageDiagnostics).toEqual([]);

        // Search: one entry for each document's body, one per section heading,
        // one for the index page.
        const search = JSON.parse(
          site.result.exports.get("/search.json")?.render("http://x") ?? "{}",
        ) as { entries: readonly { url: string }[] };
        expect(search.entries).toHaveLength(DOCUMENTS * 2 + 1);
        expect(new Set(search.entries.map((entry) => entry.url)).size).toBe(
          search.entries.length,
        );

        // Incremental: an edit re-renders one document, and the totals still
        // balance — nothing was dropped to make the arithmetic work.
        await writeFiles(root, {
          "section-0/document-0.md": "# Document 0\n\nEdited.\n",
        });
        const summary = await site.update();

        expect(summary.rendered).toBe(1);
        expect(summary.reused).toBe(DOCUMENTS);
        expect(summary.removed).toBe(0);
        expect(site.result.pages.size).toBe(DOCUMENTS + 2);
      });
    },
    TIMEOUT_MS,
  );
});
