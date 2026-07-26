import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  listFiles,
  withTemporaryDirectory,
  writeFiles,
} from "./temporary-directory.js";

describe("withTemporaryDirectory", () => {
  it("provides a directory that exists while the callback runs", async () => {
    const seen = await withTemporaryDirectory((directory) => {
      expect(existsSync(directory)).toBe(true);
      expect(directory.startsWith(os.tmpdir())).toBe(true);
      return directory;
    });

    expect(existsSync(seen)).toBe(false);
  });

  it("removes the directory and its contents on success", async () => {
    const seen = await withTemporaryDirectory(async (directory) => {
      await writeFiles(directory, {
        "docs/index.md": "# Index\n",
        "docs/guide/setup.md": "# Setup\n",
      });
      return directory;
    });

    expect(existsSync(seen)).toBe(false);
  });

  it("removes the directory even when the callback throws", async () => {
    let seen = "";
    const failure = new Error("callback failed");

    await expect(
      withTemporaryDirectory(async (directory) => {
        seen = directory;
        await writeFiles(directory, { "a.md": "a" });
        throw failure;
      }),
    ).rejects.toBe(failure);

    // The cleanup must not depend on the callback succeeding, otherwise a
    // single failing test would leak a directory on every run.
    expect(seen).not.toBe("");
    expect(existsSync(seen)).toBe(false);
  });

  it("gives concurrent callers separate directories", async () => {
    const directories = await Promise.all(
      Array.from({ length: 4 }, () =>
        withTemporaryDirectory(async (directory) => {
          await writeFiles(directory, { "marker.txt": directory });
          return directory;
        }),
      ),
    );

    expect(new Set(directories).size).toBe(directories.length);
    for (const directory of directories) {
      expect(existsSync(directory)).toBe(false);
    }
  });

  it("propagates the callback's return value", async () => {
    await expect(withTemporaryDirectory(() => 42)).resolves.toBe(42);
  });
});

describe("writeFiles and listFiles", () => {
  it("writes nested fixtures from POSIX-style keys on any platform", async () => {
    await withTemporaryDirectory(async (directory) => {
      await writeFiles(directory, {
        "docs/guide/setup.md": "# Setup\n",
        "docs/index.md": "# Index\n",
      });

      // Written with "/" in the fixture, read back through the host separator.
      const nested = path.join(directory, "docs", "guide", "setup.md");
      await expect(readFile(nested, "utf8")).resolves.toBe("# Setup\n");
    });
  });

  it("lists files sorted and with POSIX separators", async () => {
    await withTemporaryDirectory(async (directory) => {
      await writeFiles(directory, {
        "z.md": "z",
        "docs/index.md": "i",
        "docs/guide/setup.md": "s",
        "a.md": "a",
      });

      // Insertion order above is deliberately unsorted; readdir order is
      // decided by the file system and differs across platforms.
      await expect(listFiles(directory)).resolves.toEqual([
        "a.md",
        "docs/guide/setup.md",
        "docs/index.md",
        "z.md",
      ]);
    });
  });

  it("sorts lexicographically rather than in traversal order", async () => {
    await withTemporaryDirectory(async (directory) => {
      await writeFiles(directory, {
        "docs/index.md": "i",
        "docs.md": "d",
      });

      // A depth-first walk reaches `docs/index.md` first, because the `docs`
      // directory is visited before the `docs.md` sibling. Sorting the full
      // paths reverses that, since "." sorts before "/". Asserting on a tree
      // whose traversal order already matches its sorted order would pass even
      // if the sort were removed.
      await expect(listFiles(directory)).resolves.toEqual([
        "docs.md",
        "docs/index.md",
      ]);
    });
  });

  it("returns an empty list for an empty directory", async () => {
    await withTemporaryDirectory(async (directory) => {
      await expect(listFiles(directory)).resolves.toEqual([]);
    });
  });
});
