import type { DocumentRecord } from "./records.js";

/**
 * The search index.
 *
 * Built from the same export records as everything else, and split by heading:
 * a reader searching for "install" wants the section about installing, not the
 * page that mentions it somewhere. Each entry therefore addresses a heading —
 * `/guide/setup#install` — and carries only that section's text.
 *
 * ## What is in it, and what is deliberately not
 *
 * Records are **text, not tokens**. Tokenizing here would fix a matching
 * strategy into a file that a browser, a build tool and a future server-side
 * search would all have to agree with; leaving the text in place lets each
 * decide. The file is a corpus, not an inverted index.
 *
 * Hidden documents are excluded. A page an author kept out of the navigation is
 * a page they did not want found by browsing, and search is browsing.
 *
 * ## What the file costs, and what was done about it
 *
 * RFC 5 measured this repository's own documentation at 233 KB across 298
 * entries, and measured what truncating each section's text would buy: bounding
 * it at 300 characters saved 38% of the file and removed 32% of the corpus's
 * distinct words from the index entirely. Truncation is a bad trade at every
 * bound, so the text is whole and the savings come from the encoding instead.
 *
 * Two things went. Entries no longer carry an `id`: it was the route before
 * percent-encoding and before the base path, which made it byte-identical to
 * `url` in all 298 entries of a real site, and nothing read it. And the file is
 * no longer indented, but written one entry per line, which keeps it
 * reviewable in a diff without paying for the alignment. Together, 13%.
 */

export const searchSchemaVersion = 2;

export interface SearchEntry {
  /** Where following this result goes. */
  readonly url: string;
  /** The document's title, for grouping results. */
  readonly document: string;
  /** The section's heading, absent for text before the first heading. */
  readonly section?: string;
  /** The document's description, on the entry that represents the page. */
  readonly description?: string;
  /** The section's readable text. */
  readonly text: string;
}

/**
 * Splits a record's text into sections by its headings.
 *
 * The text is already block-per-line, and headings appear in it in document
 * order, so the split is a walk down the lines looking for the next heading.
 * That works for Markdown and HTML alike because both arrive as the same AST.
 */
function sectionsOf(record: DocumentRecord): readonly SearchEntry[] {
  const lines = record.text === "" ? [] : record.text.split("\n");
  const headings = new Map(
    record.headings.map((heading) => [heading.text, heading]),
  );

  const entries: SearchEntry[] = [];
  let current: { readonly heading?: string; readonly id?: string } = {};
  let buffer: string[] = [];

  const flush = (): void => {
    const text = buffer.join("\n").trim();
    buffer = [];

    if (text === "" && current.heading === undefined) {
      return;
    }

    const fragment = current.id === undefined ? "" : `#${current.id}`;

    entries.push({
      url: `${record.url}${fragment}`,
      document: record.title,
      ...(current.heading === undefined ? {} : { section: current.heading }),
      ...(current.heading === undefined && record.description !== undefined
        ? { description: record.description }
        : {}),
      text,
    });
  };

  for (const line of lines) {
    const heading = headings.get(line);
    if (heading !== undefined) {
      flush();
      current = {
        heading: heading.text,
        ...(heading.id === undefined ? {} : { id: heading.id }),
      };
      continue;
    }
    buffer.push(line);
  }

  flush();

  // A document with no text at all still has to be findable by its title.
  return entries.length === 0
    ? [
        {
          url: record.url,
          document: record.title,
          ...(record.description === undefined
            ? {}
            : { description: record.description }),
          text: "",
        },
      ]
    : entries;
}

/**
 * Builds the search entries for a project.
 *
 * Order follows the records, which are ordered by route, so the file is
 * byte-identical between runs and reviewable in a diff.
 */
export function searchEntries(
  records: readonly DocumentRecord[],
): readonly SearchEntry[] {
  return records
    .filter(
      (record) => !record.hidden && !record.generated && record.renderable,
    )
    .flatMap((record) => sectionsOf(record));
}

/**
 * The served file: a schema version and the entries, one entry per line.
 *
 * Written by hand rather than by `JSON.stringify(value, null, 2)`, because
 * indenting every field of every entry cost 15 KB here to align a file that a
 * script fetches. One entry per line keeps the property that indentation was
 * really buying — a diff that names the section that changed — and `documents.json`
 * remains the indented one, because that is the file people open in a browser.
 */
export function searchJson(records: readonly DocumentRecord[]): string {
  const entries = searchEntries(records)
    .map((entry) => JSON.stringify(entry))
    .join(",\n");

  return `{"schemaVersion":${JSON.stringify(searchSchemaVersion)},"generator":"tsumugu","entries":[\n${entries}\n]}\n`;
}
