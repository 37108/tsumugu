import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { diffSnapshots } from "./events.js";
import { scan, scannerCodes } from "./scan.js";

/**
 * Local temporary-directory helper.
 *
 * The repository-level helpers live outside this package, and a package
 * reaching out of its own directory is exactly what the boundary rules forbid.
 * A package test is self-contained.
 */
async function withProject(
  files: Readonly<Record<string, string>>,
  use: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tsumugu-scan-"));
  try {
    for (const [relative, contents] of Object.entries(files)) {
      const target = path.join(root, ...relative.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, contents, "utf8");
    }
    await use(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function paths(
  snapshot: Awaited<ReturnType<typeof scan>>["snapshot"],
): string[] {
  return [...snapshot.values()].map((document) => document.sourcePath).sort();
}

describe("scan", () => {
  it("discovers supported files recursively", async () => {
    await withProject(
      {
        "index.md": "# Home\n",
        "guide/setup.md": "# Setup\n",
        "guide/deep/nested.html": "<p>Deep</p>",
      },
      async (root) => {
        const result = await scan({ root });

        expect(paths(result.snapshot)).toEqual([
          "guide/deep/nested.html",
          "guide/setup.md",
          "index.md",
        ]);
        expect(result.diagnostics).toEqual([]);
      },
    );
  });

  it("records size and modification time without reading the file", async () => {
    await withProject({ "a.md": "# Title\n" }, async (root) => {
      const [document] = [...(await scan({ root })).snapshot.values()];

      expect(document?.stat.size).toBe(8);
      expect(document?.stat.modifiedAtMs).toBeGreaterThan(0);
      expect(document?.format).toBe("markdown");
    });
  });

  it("uses POSIX separators in source paths on every platform", async () => {
    await withProject({ "guide/deep/a.md": "x" }, async (root) => {
      const [document] = [...(await scan({ root })).snapshot.values()];

      // path.relative yields backslashes on Windows; a route built from that
      // would be wrong, so the separator never survives discovery.
      expect(document?.sourcePath).toBe("guide/deep/a.md");
      expect(document?.sourcePath).not.toContain("\\");
    });
  });

  it("ignores unsupported files without complaining about them", async () => {
    // Images, licences and archives sit beside documentation all the time.
    await withProject(
      { "a.md": "x", "diagram.png": "x", LICENSE: "x", "data.json": "{}" },
      async (root) => {
        const result = await scan({ root });

        expect(paths(result.snapshot)).toEqual(["a.md"]);
        expect(result.diagnostics).toEqual([]);
      },
    );
  });

  it("skips hidden entries and node_modules", async () => {
    await withProject(
      {
        "a.md": "x",
        ".git/config.md": "x",
        ".obsidian/notes.md": "x",
        "node_modules/pkg/readme.md": "x",
        ".hidden.md": "x",
      },
      async (root) => {
        expect(paths((await scan({ root })).snapshot)).toEqual(["a.md"]);
      },
    );
  });

  it("skips editor droppings", async () => {
    // Without this, opening a file in an editor produces added and removed
    // events for its swap file while the author is typing.
    await withProject(
      {
        "a.md": "x",
        "a.md~": "x",
        ".a.md.swp": "x",
        ".#a.md": "x",
        "#a.md#": "x",
        ".DS_Store": "x",
      },
      async (root) => {
        expect(paths((await scan({ root })).snapshot)).toEqual(["a.md"]);
      },
    );
  });

  it("accepts extra names to ignore", async () => {
    await withProject(
      { "a.md": "x", "drafts/b.md": "x", "archive.md": "x" },
      async (root) => {
        const result = await scan({ root, ignore: ["drafts", "archive.md"] });

        expect(paths(result.snapshot)).toEqual(["a.md"]);
      },
    );
  });

  it("discovers files in a deterministic order", async () => {
    await withProject(
      { "z.md": "x", "a.md": "x", "m/b.md": "x", "m/a.md": "x" },
      async (root) => {
        const first = [...(await scan({ root })).snapshot.keys()];
        const second = [...(await scan({ root })).snapshot.keys()];

        // Directory order is chosen by the file system and differs between
        // platforms; event order must not.
        expect(second).toEqual(first);
        expect(first).toEqual(["a.md", "m/a.md", "m/b.md", "z.md"]);
      },
    );
  });

  it("produces an empty snapshot for an empty root", async () => {
    await withProject({}, async (root) => {
      const result = await scan({ root });

      expect(result.snapshot.size).toBe(0);
      expect(result.diagnostics).toEqual([]);
    });
  });

  it("reports an unreadable root as fatal", async () => {
    const result = await scan({
      root: path.join(os.tmpdir(), "tsumugu-missing-root"),
    });

    expect(result.snapshot.size).toBe(0);
    expect(result.diagnostics[0]?.code).toBe(scannerCodes.rootUnreadable);
    // Nothing can be served at all, so this is not scoped to one document.
    expect(result.diagnostics[0]?.severity).toBe("fatal");
    // The underlying error stays reachable for debugging.
    expect(result.diagnostics[0]?.cause).toBeDefined();
  });

  // Creating a symbolic link on Windows needs Developer Mode or elevation, so
  // the check is skipped there rather than reported as a Tsumugu failure. The
  // behaviour it covers is not platform-specific.
  it("does not follow symbolic links, and says so", async (context) => {
    await withProject({ "a.md": "x" }, async (root) => {
      const outside = await mkdtemp(path.join(os.tmpdir(), "tsumugu-outside-"));
      try {
        await writeFile(path.join(outside, "secret.md"), "secret", "utf8");
        try {
          await symlink(outside, path.join(root, "linked"), "dir");
        } catch {
          context.skip("this host does not permit creating symbolic links");
          return;
        }

        const result = await scan({ root });

        // A link can point anywhere; following one would serve content from a
        // place the user never put in their project.
        expect(paths(result.snapshot)).toEqual(["a.md"]);
        expect(result.diagnostics[0]?.code).toBe(scannerCodes.symlinkSkipped);
        expect(result.diagnostics[0]?.message).toContain("linked");
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });
  });

  // chmod does not restrict directory reads on Windows, so there is no way to
  // create the condition there.
  it.skipIf(process.platform === "win32")(
    "continues past a directory it cannot read",
    async () => {
      await withProject({ "a.md": "x", "locked/b.md": "x" }, async (root) => {
        const locked = path.join(root, "locked");
        await chmod(locked, 0o000);
        try {
          const result = await scan({ root });

          // One unreadable directory must not cost the user every other page.
          expect(paths(result.snapshot)).toEqual(["a.md"]);
          expect(result.diagnostics[0]?.code).toBe(scannerCodes.unreadable);
          expect(result.diagnostics[0]?.severity).toBe("warning");
        } finally {
          await chmod(locked, 0o755);
        }
      });
    },
  );

  it("feeds the diff so a rescan reports only what moved", async () => {
    await withProject({ "a.md": "one", "b.md": "two" }, async (root) => {
      const before = (await scan({ root })).snapshot;

      await writeFile(path.join(root, "a.md"), "one changed", "utf8");
      await rm(path.join(root, "b.md"));
      await writeFile(path.join(root, "c.md"), "three", "utf8");

      const after = (await scan({ root })).snapshot;
      const events = diffSnapshots(before, after);

      expect(
        events.map((event) =>
          event.kind === "removed"
            ? `removed ${event.sourcePath}`
            : `${event.kind} ${event.document.sourcePath}`,
        ),
      ).toEqual(["removed b.md", "added c.md", "changed a.md"]);
    });
  });
});
