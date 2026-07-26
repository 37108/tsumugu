/**
 * Normalized document metadata.
 *
 * Metadata arrives from front matter, HTML `<meta>` elements, and eventually
 * other sources. Those disagree about types and casing, so downstream stages
 * see one normalized shape rather than each learning where a value came from.
 *
 * Extracting metadata from a particular source format, and deciding which
 * source wins when several provide the same key, are separate concerns. This
 * module defines only what metadata *is* once it has been collected.
 */

/** A metadata value, restricted to what survives a round trip through JSON. */
export type MetadataValue =
  string | number | boolean | null | readonly MetadataValue[];

export interface DocumentMetadata {
  /**
   * Every key the source provided, normalized but never dropped.
   *
   * Unknown keys are preserved rather than rejected. A user who writes
   * `audience: internal` in their front matter has said something meaningful
   * about their document; discarding it because this version of Tsumugu has no
   * feature for it would make the tool lossy, and "plain files forever" means
   * the file's contents survive the tool that reads them. Preserved keys are
   * available to transformers and to the machine-readable exports.
   */
  readonly values: ReadonlyMap<string, MetadataValue>;
}

/** Metadata for a document whose source declared none. */
export const emptyMetadata: DocumentMetadata = { values: new Map() };

/**
 * Normalizes a metadata key.
 *
 * Keys are lower-cased and trimmed so that `Title`, `title` and `TITLE` are one
 * key. Front matter is hand-written, and a document that behaves differently
 * because of a capital letter is a bad afternoon for whoever has to find out
 * why.
 */
export function normalizeMetadataKey(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * Builds normalized metadata from collected entries.
 *
 * Entries are supplied in precedence order, lowest first, so a later entry
 * overwrites an earlier one with the same normalized key. Keys that normalize
 * to an empty string are dropped: they cannot be looked up and would otherwise
 * collide with each other.
 */
export function toDocumentMetadata(
  entries: Iterable<readonly [string, MetadataValue]>,
): DocumentMetadata {
  const values = new Map<string, MetadataValue>();

  for (const [key, value] of entries) {
    const normalized = normalizeMetadataKey(key);
    if (normalized === "") {
      continue;
    }
    values.set(normalized, value);
  }

  return { values };
}

/**
 * Reads a metadata value as a non-empty string, or `undefined`.
 *
 * Front matter is untyped, so `title: 2026` parses as a number and
 * `title:` parses as null. Callers that need a string get one or nothing,
 * rather than having to re-check the union at every use.
 */
export function metadataString(
  metadata: DocumentMetadata,
  key: string,
): string | undefined {
  const value = metadata.values.get(normalizeMetadataKey(key));
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
