import { describe, expect, it } from "vitest";

import {
  discoverDocument,
  type DiscoveredDocument,
  type FileStat,
} from "../document/document.js";
import {
  toRoutePath,
  type RoutePath,
  type SourcePath,
} from "../document/paths.js";
import { diffSnapshots, toSnapshot } from "./events.js";
import {
  createFileReader,
  reconcile,
  reconcileCodes,
  type DocumentCache,
  type ReconcileOptions,
} from "./reconcile.js";

function discovered(
  path: string,
  stat: Partial<FileStat> = {},
): DiscoveredDocument {
  const result = discoverDocument(path, {
    size: 10,
    modifiedAtMs: 1000,
    ...stat,
  });
  if (!result.ok) {
    throw new Error(result.diagnostic.message);
  }
  return result.value;
}

function toRoute(sourcePath: SourcePath): RoutePath {
  const result = toRoutePath(`/${sourcePath.replace(/\.[^.]+$/, "")}`);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

/** A reader backed by a plain object, so no file system is involved. */
function readerFor(files: Readonly<Record<string, string>>): ReconcileOptions {
  return {
    readContent: (document) => Promise.resolve(files[document.sourcePath]),
    toRoute,
  };
}

async function seed(
  files: Readonly<Record<string, string>>,
): Promise<DocumentCache> {
  const snapshot = toSnapshot(
    Object.keys(files).map((path) => discovered(path)),
  );
  const result = await reconcile(
    new Map(),
    diffSnapshots(new Map(), snapshot),
    readerFor(files),
  );
  return result.cache;
}

describe("reconcile", () => {
  it("loads newly added documents", async () => {
    const files = { "a.md": "# A\n" };
    const snapshot = toSnapshot([discovered("a.md")]);

    const result = await reconcile(
      new Map(),
      diffSnapshots(new Map(), snapshot),
      readerFor(files),
    );

    expect(result.changes.map((change) => change.kind)).toEqual(["added"]);
    expect(result.cache.get("a.md" as never)?.content).toBe("# A\n");
    expect(result.counters).toEqual({
      skipped: 0,
      reads: 1,
      hashes: 1,
      unchangedAfterHash: 0,
    });
  });

  it("never reads a file the scanner did not report", async () => {
    // The point of the whole strategy: cost proportional to the edit, not to
    // the project.
    const files = { "a.md": "A", "b.md": "B", "c.md": "C" };
    const cache = await seed(files);
    const before = toSnapshot(
      Object.keys(files).map((path) => discovered(path)),
    );
    const after = toSnapshot([
      discovered("a.md", { size: 99 }),
      discovered("b.md"),
      discovered("c.md"),
    ]);

    const result = await reconcile(
      cache,
      diffSnapshots(before, after),
      readerFor({ ...files, "a.md": "A changed" }),
    );

    expect(result.counters.reads).toBe(1);
    expect(result.counters.skipped).toBe(2);
  });

  it("reports a real content change as updated", async () => {
    const cache = await seed({ "a.md": "one" });
    const before = toSnapshot([discovered("a.md")]);
    const after = toSnapshot([discovered("a.md", { size: 20 })]);

    const result = await reconcile(
      cache,
      diffSnapshots(before, after),
      readerFor({ "a.md": "two" }),
    );

    const [change] = result.changes;
    expect(change?.kind).toBe("updated");
    if (change?.kind !== "updated") {
      return;
    }
    expect(change.previous.content).toBe("one");
    expect(change.document.content).toBe("two");
    expect(change.document.contentHash).not.toBe(change.previous.contentHash);
  });

  it("reports a stat-only change as touched and invalidates nothing", async () => {
    // A git checkout, a touch, or a save that rewrote identical bytes. The
    // timestamp moved; there is nothing to rerender.
    const cache = await seed({ "a.md": "same" });
    const before = toSnapshot([discovered("a.md")]);
    const after = toSnapshot([discovered("a.md", { modifiedAtMs: 9999 })]);

    const result = await reconcile(
      cache,
      diffSnapshots(before, after),
      readerFor({ "a.md": "same" }),
    );

    const [change] = result.changes;
    expect(change?.kind).toBe("touched");
    expect(result.counters.unchangedAfterHash).toBe(1);
    // The document is the same one, with a refreshed stat so the next scan's
    // fast path is accurate.
    expect(result.cache.get("a.md" as never)?.stat.modifiedAtMs).toBe(9999);
    expect(result.cache.get("a.md" as never)?.contentHash).toBe(
      cache.get("a.md" as never)?.contentHash,
    );
  });

  it("detects a content change that kept the same size", async () => {
    // Same length, different bytes: the stat fast path cannot see this, so it
    // is only detectable because the timestamp moved and the hash was checked.
    const cache = await seed({ "a.md": "abcd" });
    const before = toSnapshot([discovered("a.md")]);
    const after = toSnapshot([discovered("a.md", { modifiedAtMs: 2000 })]);

    const result = await reconcile(
      cache,
      diffSnapshots(before, after),
      readerFor({ "a.md": "abce" }),
    );

    expect(result.changes[0]?.kind).toBe("updated");
    expect(result.counters.unchangedAfterHash).toBe(0);
  });

  it("evicts a removed document", async () => {
    const cache = await seed({ "a.md": "A", "b.md": "B" });
    const before = toSnapshot([discovered("a.md"), discovered("b.md")]);
    const after = toSnapshot([discovered("a.md")]);

    const result = await reconcile(
      cache,
      diffSnapshots(before, after),
      readerFor({ "a.md": "A" }),
    );

    // Otherwise the document, and anything rendered from it, stays reachable
    // behind a route with no source.
    expect(result.cache.has("b.md" as never)).toBe(false);
    expect(result.changes[0]?.kind).toBe("removed");
    expect(result.counters.reads).toBe(0);
  });

  it("drops a file that vanished between the listing and the read", async () => {
    const cache = await seed({ "a.md": "A" });
    const before = toSnapshot([discovered("a.md")]);
    const after = toSnapshot([discovered("a.md", { size: 5 })]);

    const result = await reconcile(cache, diffSnapshots(before, after), {
      // Ordinary while an editor saves; the next scan settles it.
      readContent: () => Promise.resolve(undefined),
      toRoute,
    });

    expect(result.cache.has("a.md" as never)).toBe(false);
    expect(result.diagnostics).toEqual([]);
    expect(result.changes).toEqual([]);
  });

  it("keeps the cached document when a read fails for another reason", async () => {
    const cause = new Error("EACCES");
    const cache = await seed({ "a.md": "A" });
    const before = toSnapshot([discovered("a.md")]);
    const after = toSnapshot([discovered("a.md", { size: 5 })]);

    const result = await reconcile(cache, diffSnapshots(before, after), {
      readContent: () => Promise.reject(cause),
      toRoute,
    });

    // A permission problem is not a deletion. Serving the last good version
    // beats serving nothing.
    expect(result.cache.get("a.md" as never)?.content).toBe("A");
    expect(result.diagnostics[0]?.code).toBe(reconcileCodes.unreadable);
    expect(result.diagnostics[0]?.cause).toBe(cause);
  });

  it("does not modify the cache it was given", async () => {
    const cache = await seed({ "a.md": "A" });
    const before = toSnapshot([discovered("a.md")]);
    const after = toSnapshot([discovered("a.md", { size: 5 })]);

    await reconcile(
      cache,
      diffSnapshots(before, after),
      readerFor({ "a.md": "B" }),
    );

    expect(cache.get("a.md" as never)?.content).toBe("A");
  });

  it("is a no-op when nothing changed", async () => {
    const cache = await seed({ "a.md": "A" });
    const snapshot = toSnapshot([discovered("a.md")]);

    const result = await reconcile(
      cache,
      diffSnapshots(snapshot, snapshot),
      readerFor({ "a.md": "A" }),
    );

    expect(result.changes).toEqual([]);
    expect(result.counters).toEqual({
      skipped: 1,
      reads: 0,
      hashes: 0,
      unchangedAfterHash: 0,
    });
  });

  it("produces the same result for the same inputs", async () => {
    const cache = await seed({ "a.md": "A" });
    const before = toSnapshot([discovered("a.md")]);
    const after = toSnapshot([discovered("a.md", { size: 5 })]);
    const events = diffSnapshots(before, after);

    const first = await reconcile(cache, events, readerFor({ "a.md": "B" }));
    const second = await reconcile(cache, events, readerFor({ "a.md": "B" }));

    expect(second.counters).toEqual(first.counters);
    expect(second.cache.get("a.md" as never)?.contentHash).toBe(
      first.cache.get("a.md" as never)?.contentHash,
    );
  });
});

describe("createFileReader", () => {
  it("returns undefined for a file that is not there", async () => {
    const read = createFileReader("/definitely/not/a/real/root");

    await expect(read(discovered("a.md"))).resolves.toBeUndefined();
  });
});
