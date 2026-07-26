import { describe, expect, it } from "vitest";

import {
  discoverDocument,
  type DiscoveredDocument,
  type FileStat,
} from "../document/document.js";
import {
  applyEvents,
  diffSnapshots,
  toSnapshot,
  type ScanEvent,
} from "./events.js";

const stat: FileStat = { size: 10, modifiedAtMs: 1000 };

function discovered(
  path: string,
  override: Partial<FileStat> = {},
): DiscoveredDocument {
  const result = discoverDocument(path, { ...stat, ...override });
  if (!result.ok) {
    throw new Error(result.diagnostic.message);
  }
  return result.value;
}

function describeEvents(events: readonly ScanEvent[]): string[] {
  return events.map((event) =>
    event.kind === "removed"
      ? `removed ${event.sourcePath}`
      : `${event.kind} ${event.document.sourcePath}`,
  );
}

describe("diffSnapshots", () => {
  it("reports everything as added on a first scan", () => {
    // The initial scan is just a diff against an empty snapshot, so there is
    // one implementation rather than two that can disagree.
    const after = toSnapshot([discovered("a.md"), discovered("b.md")]);

    expect(describeEvents(diffSnapshots(new Map(), after))).toEqual([
      "added a.md",
      "added b.md",
    ]);
  });

  it("reports nothing when nothing moved", () => {
    const snapshot = toSnapshot([discovered("a.md")]);

    expect(diffSnapshots(snapshot, snapshot)).toEqual([]);
  });

  it("reports a changed file and carries its previous stat", () => {
    const before = toSnapshot([discovered("a.md")]);
    const after = toSnapshot([discovered("a.md", { size: 20 })]);

    const [event] = diffSnapshots(before, after);
    expect(event?.kind).toBe("changed");
    if (event?.kind !== "changed") {
      return;
    }
    expect(event.previous).toEqual(stat);
    expect(event.document.stat.size).toBe(20);
  });

  it("notices a change in modification time alone", () => {
    const before = toSnapshot([discovered("a.md")]);
    const after = toSnapshot([discovered("a.md", { modifiedAtMs: 2000 })]);

    expect(describeEvents(diffSnapshots(before, after))).toEqual([
      "changed a.md",
    ]);
  });

  it("reports a removal", () => {
    const before = toSnapshot([discovered("a.md"), discovered("b.md")]);
    const after = toSnapshot([discovered("a.md")]);

    expect(describeEvents(diffSnapshots(before, after))).toEqual([
      "removed b.md",
    ]);
  });

  it("orders removals before additions", () => {
    // A rename is a removal plus an addition, and both can map to the same
    // route. Removing first means the graph never holds them at once, so a
    // rename cannot momentarily look like a route collision.
    const before = toSnapshot([discovered("old.md")]);
    const after = toSnapshot([discovered("new.md")]);

    expect(describeEvents(diffSnapshots(before, after))).toEqual([
      "removed old.md",
      "added new.md",
    ]);
  });

  it("orders deterministically within a kind", () => {
    const before = toSnapshot([discovered("z.md"), discovered("a.md")]);
    const after = toSnapshot([
      discovered("z.md", { size: 99 }),
      discovered("a.md", { size: 99 }),
      discovered("m.md"),
      discovered("b.md"),
    ]);

    expect(describeEvents(diffSnapshots(before, after))).toEqual([
      "added b.md",
      "added m.md",
      "changed a.md",
      "changed z.md",
    ]);
  });

  it("treats a Windows-spelled path as the same document", () => {
    const before = toSnapshot([discovered("docs/guide/a.md")]);
    const after = toSnapshot([discovered("docs\\guide\\a.md")]);

    // Otherwise the same file would look removed and re-added on every scan
    // that happened to spell its path differently.
    expect(diffSnapshots(before, after)).toEqual([]);
  });

  it("is a pure function of its inputs", () => {
    const before = toSnapshot([discovered("a.md")]);
    const after = toSnapshot([discovered("b.md")]);

    expect(diffSnapshots(before, after)).toEqual(diffSnapshots(before, after));
    expect(before.size).toBe(1);
    expect(after.size).toBe(1);
  });
});

describe("applyEvents", () => {
  it("produces the snapshot the events describe", () => {
    const before = toSnapshot([discovered("a.md"), discovered("old.md")]);
    const after = toSnapshot([
      discovered("a.md", { size: 5 }),
      discovered("new.md"),
    ]);

    const rebuilt = applyEvents(before, diffSnapshots(before, after));

    expect([...rebuilt.keys()].sort()).toEqual([...after.keys()].sort());
    expect(rebuilt.get("a.md" as never)?.stat.size).toBe(5);
  });

  it("does not modify the snapshot it was given", () => {
    const before = toSnapshot([discovered("a.md")]);
    applyEvents(before, [{ kind: "added", document: discovered("b.md") }]);

    expect(before.size).toBe(1);
  });

  it("returns an equivalent snapshot for no events", () => {
    const before = toSnapshot([discovered("a.md")]);

    expect([...applyEvents(before, []).keys()]).toEqual([...before.keys()]);
  });
});
