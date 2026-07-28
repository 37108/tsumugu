import { readFileSync } from "node:fs";

/**
 * Version of the Tsumugu core package, read from the manifest that defines it.
 *
 * It used to be a hand-written constant, and the first release bump proved why
 * that cannot work: Changesets rewrites `package.json` and knows nothing about
 * a copy of the number in a TypeScript file. Reading the manifest means there
 * is one version, in the file that release tooling owns.
 *
 * Read once at module load, synchronously, from a path relative to the built
 * file — `dist/version.js` sits one level below the manifest, both in the
 * workspace and in the published tarball, so the same relative walk works in
 * both.
 */
export const version = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;
