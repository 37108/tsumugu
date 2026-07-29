/**
 * Version of the Tsumugu core package.
 *
 * A constant, deliberately: reading the manifest at import time broke in every
 * environment whose `import.meta.url` is not a file URL. It is rewritten by
 * `scripts/sync-version.mjs` as part of `pnpm run version-packages`, in the
 * same commit as the manifest bump, and `tests/cli.test.ts` fails whenever the
 * two disagree.
 */
export const version = "0.4.1";
