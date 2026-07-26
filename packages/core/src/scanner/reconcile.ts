import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DocumentDiagnostic } from "../document/diagnostics.js";
import {
  hashContent,
  loadDocument,
  type DiscoveredDocument,
  type LoadedDocument,
} from "../document/document.js";
import type { DocumentId, RoutePath, SourcePath } from "../document/paths.js";
import type { ScanEvent } from "./events.js";

/**
 * Incremental change detection.
 *
 * Two costs matter. Reading and parsing every file on every scan makes the
 * server's response time proportional to the size of the project rather than
 * the size of the edit. Rerendering a page whose content did not actually
 * change wastes the same work for no result.
 *
 * So there are two gates. Size and modification time decide whether to read a
 * file at all — they came free with the directory listing. A content hash then
 * decides whether anything downstream needs to happen, which matters because
 * timestamps change for reasons that are not edits: a `git checkout`, a `touch`,
 * a save that rewrote identical bytes.
 *
 * This is an in-memory optimization. It is not a persistence format, nothing
 * outside the process reads it, and its shape may change freely.
 */

/** Loaded documents, by identity. */
export type DocumentCache = ReadonlyMap<DocumentId, LoadedDocument>;

/**
 * What actually happened to a document, as opposed to what the file system
 * reported.
 */
export type DocumentChange =
  | { readonly kind: "added"; readonly document: LoadedDocument }
  | {
      readonly kind: "updated";
      readonly document: LoadedDocument;
      readonly previous: LoadedDocument;
    }
  | {
      /**
       * The file's stat changed but its content did not.
       *
       * The cached document is refreshed so the next scan's fast path stays
       * accurate, and **nothing downstream needs to run**. Reported so that a
       * test or a benchmark can see the read happened and the rerender did
       * not.
       */
      readonly kind: "touched";
      readonly document: LoadedDocument;
    }
  | {
      readonly kind: "removed";
      readonly id: DocumentId;
      readonly sourcePath: SourcePath;
    };

/** Counters, so the optimization can be verified rather than assumed. */
export interface ReconcileCounters {
  /** Cached documents no event mentioned, so they were never read. */
  readonly skipped: number;
  readonly reads: number;
  readonly hashes: number;
  /** Files that were read and hashed but turned out to be identical. */
  readonly unchangedAfterHash: number;
}

export interface ReconcileOptions {
  /**
   * Reads a document's content, or returns `undefined` when the file is gone.
   *
   * Injected as an ordinary parameter so the whole strategy can be tested with
   * no file system and no mocking framework.
   */
  readonly readContent: (
    document: DiscoveredDocument,
  ) => Promise<string | undefined>;
  /** Maps a source path to its public route. */
  readonly toRoute: (sourcePath: SourcePath) => RoutePath;
}

export interface ReconcileResult {
  readonly cache: DocumentCache;
  readonly changes: readonly DocumentChange[];
  readonly diagnostics: readonly DocumentDiagnostic[];
  readonly counters: ReconcileCounters;
}

export const reconcileCodes = {
  unreadable: "cache/unreadable",
} as const;

/**
 * Applies scan events to the cache, reading only what the events implicate.
 *
 * A `changed` event means the stat moved, not that the content did. The file is
 * read and hashed, and if the hash matches, the result is `touched`: the cache
 * is refreshed and nothing downstream is invalidated.
 *
 * A file that vanishes between being listed and being read is not an error. It
 * is ordinary while an editor saves, so the entry is dropped and the next scan
 * settles it.
 */
export async function reconcile(
  cache: DocumentCache,
  events: readonly ScanEvent[],
  options: ReconcileOptions,
): Promise<ReconcileResult> {
  const next = new Map(cache);
  const changes: DocumentChange[] = [];
  const diagnostics: DocumentDiagnostic[] = [];

  let reads = 0;
  let hashes = 0;
  let unchangedAfterHash = 0;

  for (const event of events) {
    if (event.kind === "removed") {
      // A removed file must not leave its document, or its rendered output,
      // reachable behind a route that no longer has a source.
      next.delete(event.id);
      changes.push({
        kind: "removed",
        id: event.id,
        sourcePath: event.sourcePath,
      });
      continue;
    }

    let content: string | undefined;
    try {
      reads += 1;
      content = await options.readContent(event.document);
    } catch (cause) {
      diagnostics.push({
        code: reconcileCodes.unreadable,
        severity: "error",
        stage: "document",
        message: `Could not read "${event.document.sourcePath}".`,
        hint: "Its previous contents, if any, are served until it can be read again. Check the file's permissions.",
        sourcePath: event.document.sourcePath,
        cause,
      });
      continue;
    }

    if (content === undefined) {
      next.delete(event.document.id);
      continue;
    }

    hashes += 1;
    const hash = hashContent(content);
    const previous = next.get(event.document.id);

    if (previous !== undefined && previous.contentHash === hash) {
      // The timestamp moved but the bytes did not: a checkout, a touch, or a
      // save that rewrote identical content. Refresh the stat so the next
      // scan's fast path is accurate, and leave everything downstream alone.
      unchangedAfterHash += 1;
      const refreshed: LoadedDocument = {
        ...previous,
        stat: event.document.stat,
      };
      next.set(refreshed.id, refreshed);
      changes.push({ kind: "touched", document: refreshed });
      continue;
    }

    const document = loadDocument(event.document, {
      content,
      route: options.toRoute(event.document.sourcePath),
    });
    next.set(document.id, document);
    changes.push(
      previous === undefined
        ? { kind: "added", document }
        : { kind: "updated", document, previous },
    );
  }

  const mentioned = new Set(
    events.map((event) =>
      event.kind === "removed" ? event.id : event.document.id,
    ),
  );

  return {
    cache: next,
    changes,
    diagnostics,
    counters: {
      skipped: [...cache.keys()].filter((id) => !mentioned.has(id)).length,
      reads,
      hashes,
      unchangedAfterHash,
    },
  };
}

/**
 * A reader backed by the file system.
 *
 * `ENOENT` becomes `undefined` rather than an exception, because a file
 * disappearing between the listing and the read is a race an editor causes
 * routinely. Every other failure — a permission change, an I/O error — is
 * rethrown, so it becomes a diagnostic instead of being mistaken for a
 * deletion.
 */
export function createFileReader(
  root: string,
): (document: DiscoveredDocument) => Promise<string | undefined> {
  return async (document) => {
    const absolute = path.join(root, ...document.sourcePath.split("/"));
    try {
      return await readFile(absolute, "utf8");
    } catch (cause) {
      if (
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "ENOENT"
      ) {
        return undefined;
      }
      throw cause;
    }
  };
}
