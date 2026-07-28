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
 * decide. The file is a corpus, not an inverted index, and it is small enough
 * to be one: this repository's own documentation produces about 145 KB, fetched
 * once on first use rather than with the page.
 *
 * Hidden documents are excluded. A page an author kept out of the navigation is
 * a page they did not want found by browsing, and search is browsing.
 */

export const searchSchemaVersion = 1;

export interface SearchEntry {
  /** Stable identity: the route, plus the heading fragment when there is one. */
  readonly id: string;
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
      id: `${record.route}${fragment}`,
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
          id: record.route,
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

/** The served file: a schema version and the entries. */
export function searchJson(records: readonly DocumentRecord[]): string {
  return `${JSON.stringify(
    {
      schemaVersion: searchSchemaVersion,
      generator: "tsumugu",
      entries: searchEntries(records),
    },
    null,
    2,
  )}\n`;
}
