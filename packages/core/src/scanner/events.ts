import {
  isStatUnchanged,
  type DiscoveredDocument,
  type FileStat,
} from "../document/document.js";
import type { DocumentId, SourcePath } from "../document/paths.js";

/**
 * The scanner's event model.
 *
 * Downstream components must be able to update a document graph from these
 * events without rescanning the tree, and without knowing which file-watching
 * library produced them. Nothing here mentions renderers, routing, themes or
 * HTTP.
 */

/** What the scanner knows about a project at one moment. */
export type DocumentSnapshot = ReadonlyMap<DocumentId, DiscoveredDocument>;

export type ScanEvent =
  | { readonly kind: "added"; readonly document: DiscoveredDocument }
  | {
      readonly kind: "changed";
      readonly document: DiscoveredDocument;
      /** The stat this document had before, for callers comparing cheaply. */
      readonly previous: FileStat;
    }
  | {
      readonly kind: "removed";
      readonly id: DocumentId;
      readonly sourcePath: SourcePath;
    };

/** Builds a snapshot from discovered documents. */
export function toSnapshot(
  documents: Iterable<DiscoveredDocument>,
): DocumentSnapshot {
  return new Map(
    [...documents].map((document) => [document.id, document] as const),
  );
}

/**
 * Removals sort before additions, which sort before changes.
 *
 * This is not cosmetic. A rename arrives as a removal and an addition, and the
 * two documents can map to the same route. Applying the removal first means the
 * graph never holds both at once, so a rename cannot look like a route
 * collision for the instant between the events.
 */
const kindOrder = { removed: 0, added: 1, changed: 2 } as const;

function pathOf(event: ScanEvent): SourcePath {
  return event.kind === "removed"
    ? event.sourcePath
    : event.document.sourcePath;
}

/**
 * Compares two snapshots and returns what changed.
 *
 * Pure, so the whole event model is testable without touching a file system,
 * and so an initial scan and a rescan share one implementation: the first scan
 * is a diff against an empty snapshot.
 *
 * Change detection uses size and modification time, which the directory listing
 * already provided. Content hashing is a separate, more expensive step, and
 * this deliberately does not reach for it.
 *
 * Events are ordered deterministically, so the same pair of snapshots always
 * produces the same sequence.
 */
export function diffSnapshots(
  before: DocumentSnapshot,
  after: DocumentSnapshot,
): ScanEvent[] {
  const events: ScanEvent[] = [];

  for (const [id, document] of after) {
    const previous = before.get(id);
    if (previous === undefined) {
      events.push({ kind: "added", document });
    } else if (!isStatUnchanged(previous.stat, document.stat)) {
      events.push({ kind: "changed", document, previous: previous.stat });
    }
  }

  for (const [id, document] of before) {
    if (!after.has(id)) {
      events.push({ kind: "removed", id, sourcePath: document.sourcePath });
    }
  }

  return events.sort(
    (a, b) =>
      kindOrder[a.kind] - kindOrder[b.kind] ||
      (pathOf(a) < pathOf(b) ? -1 : pathOf(a) > pathOf(b) ? 1 : 0),
  );
}

/** Applies events to a snapshot, producing the snapshot they describe. */
export function applyEvents(
  snapshot: DocumentSnapshot,
  events: readonly ScanEvent[],
): DocumentSnapshot {
  const next = new Map(snapshot);

  for (const event of events) {
    if (event.kind === "removed") {
      next.delete(event.id);
    } else {
      next.set(event.document.id, event.document);
    }
  }

  return next;
}
