#!/usr/bin/env node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createSite } from "tsumugu-core";
import { createPreset } from "tsumugu-preset";

/**
 * Performance baselines.
 *
 * Numbers here are not a promise. They exist so that a change that makes
 * Tsumugu an order of magnitude slower is visible as an order of magnitude,
 * rather than as "it feels slower now". Run it before and after a change to the
 * pipeline; record the result in docs/performance.md when the shape changes.
 *
 *   node scripts/benchmark.mjs [documentCount]
 */

const documentCount = Number(process.argv[2] ?? 200);

/** A document with the shape documentation actually has. */
function document(index) {
  return [
    "---",
    `title: Document ${index}`,
    `description: One of ${documentCount} generated documents.`,
    "---",
    "",
    `# Document ${index}`,
    "",
    "Some prose about the subject, long enough to be worth indexing.",
    "",
    "## Install",
    "",
    "```ts",
    `const answer = ${index};`,
    "```",
    "",
    "## Configure",
    "",
    "| Option | Meaning |",
    "| ------ | ------- |",
    "| root   | where documents live |",
    "",
    `See [another document](/section-${index % 10}/document-${(index + 1) % documentCount}).`,
    "",
  ].join("\n");
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "tsumugu-bench-"));

  for (let index = 0; index < documentCount; index += 1) {
    const directory = path.join(root, `section-${index % 10}`);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, `document-${index}.md`),
      document(index),
    );
  }
  await writeFile(path.join(root, "index.md"), "# Benchmark\n");

  return root;
}

async function measure(label, run) {
  const started = performance.now();
  const result = await run();
  const elapsed = performance.now() - started;
  console.log(`${label.padEnd(28)} ${elapsed.toFixed(0).padStart(6)} ms`);
  return result;
}

const root = await fixture();

try {
  console.log(`documents  ${String(documentCount)}`);
  console.log(`node       ${process.version}`);
  console.log("");

  const site = await measure("first build", () =>
    createSite({ root, ...createPreset() }),
  );

  await measure("rebuild, nothing changed", () => site.update());

  await writeFile(
    path.join(root, "section-0", "document-0.md"),
    document(0).replace("Some prose", "Edited prose"),
  );
  await measure("rebuild, one document", () => site.update());

  await measure("search index", () => {
    const render = site.result.exports.get("/search.json")?.render;
    return Promise.resolve(render?.("http://localhost") ?? "");
  });

  console.log("");
  console.log(`pages      ${String(site.result.pages.size)}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
