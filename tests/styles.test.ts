import { execFile } from "node:child_process";
import { describe, expect, it } from "vitest";

import { repositoryRoot } from "./helpers/paths.js";

/**
 * The generated stylesheets stay in step with their sources.
 *
 * The shell and theme stylesheets are compiled from Tailwind-authored CSS by
 * `scripts/build-styles.mjs` and committed. Two mistakes become possible the
 * moment a file is generated: editing the output instead of the source, and
 * editing the source without regenerating. `--check` catches both, the same
 * way the version-sync script guards `version.ts`.
 */
describe("generated stylesheets", () => {
  it("match what their sources compile to", async () => {
    const outcome = await new Promise<{ code: number; stderr: string }>(
      (resolve) => {
        execFile(
          process.execPath,
          ["scripts/build-styles.mjs", "--check"],
          { cwd: repositoryRoot },
          (error, _stdout, stderr) => {
            resolve({ code: error === null ? 0 : 1, stderr });
          },
        );
      },
    );

    expect(outcome.stderr, "run: pnpm styles").not.toContain("stale");
    expect(outcome.code).toBe(0);
  }, 30_000);
});
