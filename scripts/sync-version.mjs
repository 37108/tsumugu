#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Copies the version Changesets wrote into the constant core exports.
 *
 * Runs as part of `pnpm run version-packages`, immediately after
 * `changeset version`, so the two files can only disagree between two lines of
 * one script. The constant stays a constant because reading the manifest at
 * import time broke in every environment whose `import.meta.url` is not a
 * file URL — which is exactly the kind of environment tests run in.
 *
 * `tests/cli.test.ts` runs the compiled binary and compares its output to the
 * manifest, so a bump that skips this script is a failing test, not a wrong
 * version in the wild.
 */

const manifest = JSON.parse(
  readFileSync(
    new URL("../packages/core/package.json", import.meta.url),
    "utf8",
  ),
);

const file = new URL("../packages/core/src/version.ts", import.meta.url);
const source = readFileSync(file, "utf8");
const updated = source.replace(
  /export const version = "[^"]+";/u,
  `export const version = "${manifest.version}";`,
);

if (updated === source && !source.includes(`"${manifest.version}"`)) {
  throw new Error(
    "version.ts no longer contains the constant this script rewrites",
  );
}

writeFileSync(file, updated);
console.log(`version.ts: ${manifest.version}`);
