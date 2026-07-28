import type { DocumentRecord } from "./records.js";

/**
 * The machine-readable outputs.
 *
 * Three formats, one input. Each is deterministic — the same project always
 * produces the same bytes — because these are files people commit, diff and
 * cache, and an output that reorders itself between runs is an output nobody
 * can review.
 */

/** Bumped when a field changes meaning or disappears. */
export const documentsSchemaVersion = 1;

export interface ExportSite {
  readonly name: string;
  readonly description?: string;
}

/**
 * The structured corpus.
 *
 * Everything a tool needs to reason about the documentation without rendering
 * it: routes, titles, descriptions, headings and the readable text. The source
 * itself is deliberately **not** included — it is already on disk beside the
 * file, and duplicating it would double the size of the corpus to say nothing
 * new.
 *
 * Two spaces of indentation, sorted keys by construction, and a trailing
 * newline: it is a file people will read in a browser and diff in a review.
 */
export function documentsJson(
  records: readonly DocumentRecord[],
  site: ExportSite,
): string {
  return `${JSON.stringify(
    {
      schemaVersion: documentsSchemaVersion,
      generator: "tsumugu",
      site: {
        name: site.name,
        ...(site.description === undefined
          ? {}
          : { description: site.description }),
      },
      documents: records,
    },
    null,
    2,
  )}\n`;
}

/**
 * The map for language models.
 *
 * `llms.txt` is a convention: a title, an optional summary, then sections of
 * links with one line of explanation each. It is written for something that
 * will fetch a few of the links, so it lists what exists and says what each
 * page is — and it says nothing a document did not.
 *
 * Descriptions come from front matter. Where an author wrote none, the entry is
 * the link alone rather than a sentence invented for it: a summary Tsumugu made
 * up is indistinguishable, to a reader and to a model, from one the author
 * meant.
 */
export function llmsTxt(
  records: readonly DocumentRecord[],
  site: ExportSite,
): string {
  const published = records.filter(
    (record) => !record.hidden && !record.generated && record.renderable,
  );

  const lines = [`# ${site.name}`];

  if (site.description !== undefined) {
    lines.push("", `> ${site.description}`);
  }

  lines.push(
    "",
    "This file is generated from the project's documentation. Edit the documents, not this file.",
    "",
    "## Documentation",
    "",
  );

  for (const record of published) {
    lines.push(
      record.description === undefined
        ? `- [${record.title}](${record.url})`
        : `- [${record.title}](${record.url}): ${record.description}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

/** Escapes the five characters that cannot appear literally in XML content. */
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * The sitemap.
 *
 * Absolute URLs, so the origin has to come from outside — a sitemap is a claim
 * about where something is published, and a documentation server has no way to
 * know that on its own. In development the origin is the address the server
 * bound, which makes the file inspectable without pretending it is publishable.
 *
 * Generated pages are included: the landing page is a real route a reader can
 * open. Hidden ones are not, because listing a page in a sitemap is asking for
 * it to be indexed, which is the opposite of what `hidden` means.
 */
export function sitemapXml(
  records: readonly DocumentRecord[],
  origin: string,
): string {
  const base = origin.replace(/\/+$/u, "");

  const entries = records
    .filter((record) => !record.hidden && record.renderable)
    .map(
      (record) =>
        `  <url>\n    <loc>${escapeXml(`${base}${record.url}`)}</loc>\n  </url>`,
    );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
    "",
  ].join("\n");
}
