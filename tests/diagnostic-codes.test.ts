import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { repositoryRoot, toPosixPath } from "./helpers/paths.js";
import { listFiles } from "./helpers/temporary-directory.js";

/**
 * Diagnostic codes are a contract, and `docs/diagnostics.md` is where it is
 * written down.
 *
 * Callers match on codes rather than on message text, so a code that exists but
 * is undocumented is an undocumented API. Sources are scanned as text rather
 * than imported, because the codes live beside the stages that produce them
 * and a repository-level test cannot reach into a package's internals.
 */

/** `stage/kebab-case`, as the documented convention requires. */
const codePattern = /"([a-z][a-z-]*\/[a-z][a-z-]*)"/g;

/** Prefixes only ever used by test fixtures, not by the implementation. */
const fixturePrefixes = ["test/", "fake/"];

/**
 * Strings that look like codes but are not.
 *
 * `stage/kebab-case` is the naming template the documentation states, written
 * in the same code formatting as a real code.
 */
const notCodes = new Set(["stage/kebab-case"]);

let usedCodes: readonly string[];
let documentation: string;

beforeAll(async () => {
  const sourceRoot = path.join(repositoryRoot, "packages");
  const files = (await listFiles(sourceRoot))
    .filter((file) => file.endsWith(".ts"))
    // Only the implementation declares real codes; a test may invent one.
    .filter((file) => !file.endsWith(".test.ts") && !file.includes("/dist/"));

  const found = new Set<string>();
  for (const file of files) {
    const text = await readFile(
      path.join(sourceRoot, ...file.split("/")),
      "utf8",
    );
    for (const match of text.matchAll(codePattern)) {
      const code = match[1];
      if (
        code !== undefined &&
        !fixturePrefixes.some((p) => code.startsWith(p))
      ) {
        found.add(code);
      }
    }
  }

  usedCodes = [...found].sort();
  documentation = await readFile(
    path.join(repositoryRoot, "docs", "diagnostics.md"),
    "utf8",
  );
});

describe("diagnostic codes", () => {
  it("finds the codes the implementation declares", () => {
    // Guards the scan itself: a broken search would document nothing and pass.
    expect(usedCodes.length).toBeGreaterThan(5);
    expect(usedCodes).toContain("routing/collision");
  });

  it("uses the documented naming convention", () => {
    for (const code of usedCodes) {
      expect(code, `"${code}" must be named stage/kebab-case`).toMatch(
        /^[a-z][a-z-]*\/[a-z][a-z-]*$/,
      );
    }
  });

  it("documents every code the implementation can produce", () => {
    const undocumented = usedCodes.filter(
      (code) => !documentation.includes(`\`${code}\``),
    );

    expect(
      undocumented,
      `these codes are produced but missing from docs/diagnostics.md: ${undocumented.join(", ")}`,
    ).toEqual([]);
  });

  it("does not document codes that no longer exist", () => {
    const documented = [
      ...documentation.matchAll(/`([a-z][a-z-]*\/[a-z][a-z-]*)`/g),
    ]
      .map((match) => match[1])
      .filter((code): code is string => code !== undefined)
      // The document also mentions directories such as `document/` as headings.
      .filter((code) => !code.endsWith("/"));

    const stale = [...new Set(documented)].filter(
      (code) => !usedCodes.includes(code) && !notCodes.has(code),
    );

    expect(
      stale,
      `these codes are documented but no longer produced: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the paths it scanned platform-independent", () => {
    // The scan walks the file system, so a Windows separator must not reach an
    // assertion or a failure message.
    expect(toPosixPath("packages\\core\\src")).toBe("packages/core/src");
  });
});
