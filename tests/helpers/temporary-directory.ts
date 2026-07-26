import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { toPosixPath } from "./paths.js";

/**
 * Runs `use` against a fresh temporary directory and removes the directory
 * afterwards, whether `use` returns or throws.
 *
 * Tsumugu reads the file system, so most of its behaviour can only be tested
 * against real files. Leaking those directories would slowly fill the machine
 * running the tests and would let one test observe another test's files, so
 * cleanup is not left to the caller.
 *
 * The directory is created under the operating system's temporary location via
 * `mkdtemp`, which guarantees a unique name and makes concurrent tests safe.
 */
export async function withTemporaryDirectory<T>(
  // Synchronous callbacks are accepted too, so a test that only makes
  // assertions does not have to be written `async` with nothing to await.
  use: (directory: string) => T | PromiseLike<T>,
): Promise<T> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tsumugu-"));
  try {
    return await use(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * Writes a fixture tree into `directory`.
 *
 * Keys are relative paths written with `/` on every platform, so a fixture
 * reads the same in the test source regardless of where it runs. They are
 * joined with the host separator here. Intermediate directories are created.
 */
export async function writeFiles(
  directory: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(directory, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
}

/**
 * Lists every file below `directory` as sorted, POSIX-style relative paths.
 *
 * Directory entries arrive in an order the file system chooses, which differs
 * between platforms and even between runs. Sorting here means a test asserting
 * on a tree does not have to sort at every call site to stay deterministic.
 */
export async function listFiles(directory: string): Promise<string[]> {
  const found: string[] = [];

  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else {
        found.push(toPosixPath(path.relative(directory, absolute)));
      }
    }
  };

  await walk(directory);
  return found.sort();
}
