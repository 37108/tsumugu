/**
 * The public surface of `@tsumugu/core`.
 *
 * The document pipeline described in `docs/architecture/overview.md` is not
 * implemented yet. Until it is, this module deliberately exports one value, so
 * that the package boundary, the build output, and the export map are all
 * exercised by real code rather than by a placeholder that nothing consumes.
 */

/**
 * Version of the Tsumugu core package.
 *
 * `@tsumugu/cli` reports this as the version of the Tsumugu toolchain it
 * composes. `tests/workspace.test.ts` asserts that it stays in sync with
 * `packages/core/package.json`.
 */
export const version = "0.0.0";
