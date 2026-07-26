import { createHash } from "node:crypto";

import { dedupeDiagnostics, type DocumentDiagnostic } from "./diagnostics.js";
import { emptyMetadata, type DocumentMetadata } from "./metadata.js";
import {
  detectSourceFormat,
  documentIdOf,
  toSourcePath,
  type DocumentId,
  type RoutePath,
  type SourceFormat,
  type SourcePath,
} from "./paths.js";

/**
 * The canonical document model.
 *
 * A document moves through stages, and each stage is its own type. The
 * alternative — one object whose fields fill in as it progresses — makes every
 * consumer handle combinations that cannot actually occur, and makes it
 * possible to read content that has not been loaded yet. Here, a stage that has
 * not happened is not representable.
 *
 * The stages are deliberately few. More will be added when a real consumer
 * needs to distinguish them, not in anticipation.
 */

/** What the file system reports about a file without reading it. */
export interface FileStat {
  readonly size: number;
  /** Modification time in milliseconds since the epoch. */
  readonly modifiedAtMs: number;
}

/**
 * A file the scanner has found but not read.
 *
 * Size and modification time are enough to decide whether a previously loaded
 * document is still current, which is what lets an unchanged file skip being
 * read and parsed again.
 */
export interface DiscoveredDocument {
  readonly stage: "discovered";
  readonly id: DocumentId;
  readonly sourcePath: SourcePath;
  readonly format: SourceFormat;
  readonly stat: FileStat;
}

/**
 * A document whose content has been read.
 *
 * A document reaches this stage even when something went wrong with it: a file
 * with unparsable front matter is a loaded document carrying a diagnostic, not
 * an absence. Losing the record would leave the server unable to say anything
 * useful about a page the user can see in their editor.
 */
export interface LoadedDocument {
  readonly stage: "loaded";
  readonly id: DocumentId;
  readonly sourcePath: SourcePath;
  readonly format: SourceFormat;
  readonly stat: FileStat;
  /** Hash of the exact bytes that produced this document's content. */
  readonly contentHash: string;
  readonly content: string;
  readonly metadata: DocumentMetadata;
  readonly route: RoutePath;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

/** Any stage of a document. Narrow on `stage` to reach the fields it has. */
export type Document = DiscoveredDocument | LoadedDocument;

export type DocumentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostic: DocumentDiagnostic };

/**
 * Diagnostic codes this module can produce.
 *
 * Codes are matched on; messages are not. Wording may change without changing
 * behaviour for anything that reacts to a diagnostic.
 */
export const documentCodes = {
  invalidSourcePath: "document/invalid-source-path",
  unsupportedFormat: "document/unsupported-format",
} as const;

/**
 * Hashes document content.
 *
 * SHA-256 over the UTF-8 bytes. This is a change detector, not a security
 * boundary: it answers "is this the same content as before", and the cost of a
 * collision is a stale page rather than a vulnerability. It is stated
 * explicitly so nobody later mistakes it for an integrity guarantee.
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Builds a discovered document from a path the scanner found.
 *
 * The path may use either separator and may be produced by `path.relative`, so
 * it is normalized here. Both failure modes — a path that cannot be
 * represented, and a file this build has no format for — return a diagnostic
 * rather than throwing: they describe the user's directory, not a broken
 * invariant in Tsumugu.
 */
export function discoverDocument(
  relativePath: string,
  stat: FileStat,
): DocumentResult<DiscoveredDocument> {
  const path = toSourcePath(relativePath);
  if (!path.ok) {
    return {
      ok: false,
      diagnostic: {
        code: documentCodes.invalidSourcePath,
        severity: "error",
        message: path.error.message,
      },
    };
  }

  const format = detectSourceFormat(path.value);
  if (format === undefined) {
    return {
      ok: false,
      diagnostic: {
        code: documentCodes.unsupportedFormat,
        severity: "warning",
        message: `No renderer handles "${path.value}". Supported extensions are .md, .markdown, .html and .htm.`,
        sourcePath: path.value,
      },
    };
  }

  return {
    ok: true,
    value: {
      stage: "discovered",
      id: documentIdOf(path.value),
      sourcePath: path.value,
      format,
      stat,
    },
  };
}

export interface DocumentContent {
  readonly content: string;
  readonly route: RoutePath;
  readonly metadata?: DocumentMetadata;
  readonly diagnostics?: readonly DocumentDiagnostic[];
}

/**
 * Advances a discovered document to the loaded stage.
 *
 * Identity, path, format and stat are carried across unchanged: reading a file
 * does not change which document it is.
 */
export function loadDocument(
  discovered: DiscoveredDocument,
  loaded: DocumentContent,
): LoadedDocument {
  return {
    stage: "loaded",
    id: discovered.id,
    sourcePath: discovered.sourcePath,
    format: discovered.format,
    stat: discovered.stat,
    contentHash: hashContent(loaded.content),
    content: loaded.content,
    metadata: loaded.metadata ?? emptyMetadata,
    route: loaded.route,
    diagnostics: dedupeDiagnostics(loaded.diagnostics ?? []),
  };
}

/**
 * Returns a copy of the document with further diagnostics attached.
 *
 * The document is never discarded, however bad the problem: a stage that fails
 * reports why and hands the record on, so the failure can be shown on the page
 * it belongs to. Documents are immutable, so this returns a new one.
 */
export function withDiagnostics(
  document: LoadedDocument,
  diagnostics: readonly DocumentDiagnostic[],
): LoadedDocument {
  if (diagnostics.length === 0) {
    return document;
  }
  return {
    ...document,
    diagnostics: dedupeDiagnostics([...document.diagnostics, ...diagnostics]),
  };
}

/**
 * Whether a previously loaded document still matches what is on disk.
 *
 * Size and modification time are compared first because they are already known
 * from the directory listing. Reading and hashing every file on every change
 * would make the scan cost proportional to the size of the project rather than
 * to the size of the edit.
 *
 * This can report a false "changed" — a same-size edit within the timestamp
 * granularity — which costs a re-read. It cannot report a false "unchanged"
 * for an edit that alters size or timestamp, which would be the damaging
 * direction.
 */
export function isStatUnchanged(before: FileStat, after: FileStat): boolean {
  return (
    before.size === after.size && before.modifiedAtMs === after.modifiedAtMs
  );
}
