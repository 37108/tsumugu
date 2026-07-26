import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path to the repository root.
 *
 * Derived from this file's own location rather than from `process.cwd()`, so it
 * is correct no matter which directory the test runner was started from.
 */
export const repositoryRoot = path.resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
);

/**
 * Normalizes a relative path to POSIX separators.
 *
 * `path.relative` and `path.join` produce `packages\core` on Windows and
 * `packages/core` elsewhere. Test assertions and fixture keys are written with
 * `/`, so every path that crosses into an assertion goes through here first.
 * Without it, the same assertion would have to be written twice or the suite
 * would only pass on one platform.
 *
 * Repeated separators collapse, so `packages//core` and `packages\\core` both
 * normalize to `packages/core`.
 */
export function toPosixPath(value: string): string {
  return value
    .split(/[\\/]+/)
    .filter((segment) => segment !== "")
    .join("/");
}
