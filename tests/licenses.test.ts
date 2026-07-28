import { execFile } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

import { repositoryRoot } from "./helpers/paths.js";

/**
 * License compliance for what actually ships.
 *
 * A dependency's license is a term of Tsumugu's own MIT distribution, and a
 * copyleft license arriving through a transitive update is the kind of change
 * a lockfile diff hides in plain sight. This asks pnpm for every production
 * dependency's license and compares against the list below.
 *
 * Production only, on purpose: a GPL-licensed *development* tool is fine — it
 * is used, not distributed — and auditing devDependencies would produce noise
 * that trains people to ignore the check.
 */

/**
 * Licenses Tsumugu may redistribute under.
 *
 * All are permissive and MIT-compatible. Adding one is a deliberate act with
 * a review: notably, any `GPL`, `LGPL`, `AGPL`, `SSPL` or `BUSL` entry is a
 * conversation, not an addition.
 */
const allowed = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
]);

let byLicense: Readonly<Record<string, readonly { name: string }[]>>;

beforeAll(async () => {
  byLicense = await new Promise((resolve, reject) => {
    execFile(
      "pnpm",
      ["licenses", "list", "--prod", "--json"],
      { cwd: repositoryRoot },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error(`pnpm licenses failed: ${error.message}`));
          return;
        }
        resolve(JSON.parse(stdout) as typeof byLicense);
      },
    );
  });
}, 60_000);

describe("production dependency licenses", () => {
  it("finds dependencies to audit", () => {
    // A broken invocation would report an empty set and look like a pass.
    expect(Object.keys(byLicense).length).toBeGreaterThan(0);
    expect(byLicense["MIT"]?.length ?? 0).toBeGreaterThan(0);
  });

  it("ships nothing outside the allowed list", () => {
    const violations = Object.entries(byLicense)
      .filter(([license]) => !allowed.has(license))
      .map(
        ([license, packages]) =>
          `${license}: ${packages.map((entry) => entry.name).join(", ")}`,
      );

    // A new license is not automatically wrong — it is automatically a
    // decision. Review it, then either replace the dependency or add the
    // license above with a comment saying why it is compatible.
    expect(violations).toEqual([]);
  });
});
