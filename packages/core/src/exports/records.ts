import type { DocumentNode, HeadingNode } from "../ast/nodes.js";
import { textContent, visit } from "../ast/traverse.js";
import type { SourceFormat } from "../document/document.js";
import type { RoutePath, SourcePath } from "../document/paths.js";
import { encodeRoutePath } from "../routing/routes.js";

/**
 * The export model.
 *
 * "Human and AI from one source" is a principle that only means anything if
 * there is literally one source. So every machine-readable output — the JSON
 * corpus, `llms.txt`, the sitemap, and search when it exists — is generated
 * from the records here, and the records are derived from the same documents,
 * routes and metadata the pages are.
 *
 * The alternative is scraping the rendered HTML, and it is worth naming why
 * that is rejected: HTML is the theme's output, so a theme change would change
 * what an AI reads; it is lossy about structure the AST still has; and it
 * would make the export depend on the presentation layer it is supposed to be
 * independent of.
 *
 * ## Inclusion, per consumer
 *
 * | Document | `documents.json` | `llms.txt` | `sitemap.xml` |
 * | --- | --- | --- | --- |
 * | ordinary | yes | yes | yes |
 * | hidden | yes, flagged | no | no |
 * | generated (landing page) | yes, flagged | no | yes |
 * | failed to render | yes, flagged, no text | no | no |
 *
 * Hidden documents are in the corpus because a tool asking "what does this
 * project contain" should get the truth, and they are out of `llms.txt` and the
 * sitemap because both are recommendations to publish something — which is
 * exactly what `hidden` says not to do.
 */

export interface ExportHeading {
  readonly depth: HeadingNode["depth"];
  readonly text: string;
  /** The resolved identifier, when a transformer produced one. */
  readonly id?: string;
}

export interface DocumentRecord {
  /** The canonical route, percent-encoded for use in a URL. */
  readonly url: string;
  readonly route: RoutePath;
  /** Absent for a page Tsumugu generated, which has no source file. */
  readonly sourcePath?: SourcePath;
  readonly title: string;
  readonly description?: string;
  /** Absent for a generated page. */
  readonly format?: SourceFormat;
  readonly hidden: boolean;
  readonly generated: boolean;
  /** False when no renderer could produce a document from the source. */
  readonly renderable: boolean;
  readonly headings: readonly ExportHeading[];
  /**
   * The document's readable text, from the AST rather than from the HTML.
   *
   * Block boundaries become newlines, so a paragraph and a heading do not run
   * into each other, and nothing about the theme's markup leaks in.
   */
  readonly text: string;
  /** Hash of the source content, absent for a generated page. */
  readonly contentHash?: string;
}

export interface RecordInput {
  readonly route: RoutePath;
  /** Path prefix the site is published under. Empty for the root. */
  readonly basePath?: string;
  readonly sourcePath?: SourcePath;
  readonly title: string;
  readonly description?: string;
  readonly format?: SourceFormat;
  readonly hidden: boolean;
  readonly generated: boolean;
  readonly renderable: boolean;
  readonly root?: DocumentNode;
  readonly contentHash?: string;
}

/** Node types that end a line of text. */
const blockTypes = new Set([
  "heading",
  "paragraph",
  "code-block",
  "list-item",
  "table-row",
  "blockquote",
  "thematic-break",
  "diagram",
]);

/**
 * The document's text, block by block.
 *
 * `textContent` on the whole tree would join a heading to the paragraph after
 * it with no separator, which reads as one sentence to anything that later
 * chunks or summarizes it.
 */
export function documentText(root: DocumentNode): string {
  const lines: string[] = [];

  visit(root, (node) => {
    if (!blockTypes.has(node.type)) {
      return "continue";
    }
    const text = textContent(node).trim();
    if (text !== "") {
      lines.push(text);
    }
    // Nested blocks — a paragraph inside a list item — are covered by their
    // ancestor's text, so descending again would repeat them.
    return "skip";
  });

  return lines.join("\n");
}

/** Every heading in the document, in document order. */
export function documentHeadings(root: DocumentNode): readonly ExportHeading[] {
  const headings: ExportHeading[] = [];

  visit(root, (node) => {
    if (node.type !== "heading") {
      return "continue";
    }
    const text = textContent(node).trim();
    if (text !== "") {
      headings.push({
        depth: node.depth,
        text,
        ...(node.id === undefined ? {} : { id: node.id }),
      });
    }
    return "skip";
  });

  return headings;
}

/** Builds one record. */
export function toRecord(input: RecordInput): DocumentRecord {
  const root = input.renderable ? input.root : undefined;

  return {
    url: `${input.basePath ?? ""}${encodeRoutePath(input.route)}`,
    route: input.route,
    ...(input.sourcePath === undefined ? {} : { sourcePath: input.sourcePath }),
    title: input.title,
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    ...(input.format === undefined ? {} : { format: input.format }),
    hidden: input.hidden,
    generated: input.generated,
    renderable: input.renderable,
    headings: root === undefined ? [] : documentHeadings(root),
    text: root === undefined ? "" : documentText(root),
    ...(input.contentHash === undefined
      ? {}
      : { contentHash: input.contentHash }),
  };
}

/**
 * Orders records by route.
 *
 * By route rather than by title, because a route is unique and a title is not,
 * and by code unit rather than by locale, for the reason navigation sorts that
 * way: the same project must produce the same file on every machine.
 */
export function sortRecords(
  records: readonly DocumentRecord[],
): readonly DocumentRecord[] {
  return [...records].sort((left, right) =>
    left.route === right.route ? 0 : left.route < right.route ? -1 : 1,
  );
}
