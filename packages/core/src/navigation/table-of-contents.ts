import type { DocumentNode, HeadingNode } from "../ast/nodes.js";
import { textContent, visit } from "../ast/traverse.js";

/**
 * In-page navigation, derived from the document's own headings.
 *
 * The table of contents is the document's outline, so it is read from the AST
 * rather than assembled by a theme: the same data serves the sidebar, and later
 * search results and the machine-readable exports, and all of them agree
 * because there is one derivation.
 *
 * It is built after the heading-id transformer has run. A heading with no
 * resolved identifier is left out — an entry that cannot be linked is a line of
 * text pretending to be navigation.
 */

export interface TableOfContentsEntry {
  readonly id: string;
  readonly label: string;
  readonly depth: HeadingNode["depth"];
  readonly children: readonly TableOfContentsEntry[];
}

export interface TableOfContentsOptions {
  /**
   * Shallowest heading level included. Defaults to 2.
   *
   * A page's single level-one heading is its title, which the shell already
   * shows; listing it in the page's own contents says "this page" twice.
   */
  readonly minDepth?: HeadingNode["depth"];
  /** Deepest heading level included. Defaults to 3. */
  readonly maxDepth?: HeadingNode["depth"];
}

/**
 * Builds the outline.
 *
 * **Skipped levels do not create empty entries.** A document that goes from a
 * level two to a level four has an author's mistake in it, not a missing
 * section, and inventing a placeholder to nest under would put words on the
 * page that nobody wrote. The deeper heading becomes a child of whatever
 * precedes it, so the outline stays a tree and stays honest about what the
 * document contains.
 */
export function buildTableOfContents(
  root: DocumentNode,
  options: TableOfContentsOptions = {},
): readonly TableOfContentsEntry[] {
  const minDepth = options.minDepth ?? 2;
  const maxDepth = options.maxDepth ?? 3;

  const items: TableOfContentsEntry[] = [];
  // Entries are collected flat and nested afterwards, with a stack of the open
  // ancestors. Nesting during traversal would need the same stack anyway, and
  // this way the traversal stays a filter.
  const flat: {
    readonly entry: TableOfContentsEntry;
    children: TableOfContentsEntry[];
  }[] = [];

  visit(root, (node) => {
    if (node.type !== "heading") {
      return "continue";
    }
    if (node.depth < minDepth || node.depth > maxDepth) {
      return "skip";
    }
    if (node.id === undefined) {
      return "skip";
    }

    const label = textContent(node).trim();
    if (label === "") {
      // A heading with no text has nothing to show in a list, even though it
      // still has an identifier and is still linkable.
      return "skip";
    }

    const children: TableOfContentsEntry[] = [];
    const entry: TableOfContentsEntry = {
      id: node.id,
      label,
      depth: node.depth,
      children,
    };

    while (
      flat.length > 0 &&
      (flat[flat.length - 1]?.entry.depth ?? 0) >= node.depth
    ) {
      flat.pop();
    }

    const parent = flat[flat.length - 1];
    if (parent === undefined) {
      items.push(entry);
    } else {
      parent.children.push(entry);
    }

    flat.push({ entry, children });
    return "skip";
  });

  return items;
}
