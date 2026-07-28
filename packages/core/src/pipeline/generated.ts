import type {
  BlockNode,
  DocumentNode,
  InlineNode,
  ListItemNode,
} from "../ast/nodes.js";
import type { NavigationItem } from "../navigation/tree.js";
import { encodeRoutePath } from "../routing/routes.js";

/**
 * Pages Tsumugu writes itself.
 *
 * A documentation root with no `index.md`, and a link to a page that no longer
 * exists, are both ordinary situations rather than failures — and both deserve
 * a real page instead of a blank one. So the server generates a document for
 * them, as a **Semantic AST**, which then goes through the same transformers,
 * theme, shell and serializer every other page does. A generated page that took
 * a shortcut around the pipeline would be the one page that looked different,
 * and it would stop being a test of whether the pipeline works.
 *
 * Everything on these pages is derived from what the project actually contains.
 * Nothing here writes a description of a project it has not read, or a summary
 * of a document it cannot see: an invented sentence on a generated page is
 * indistinguishable from one the author wrote.
 */

function paragraph(...children: readonly InlineNode[]): BlockNode {
  return { type: "paragraph", children };
}

function text(value: string): InlineNode {
  return { type: "text", value };
}

function link(url: string, label: string): InlineNode {
  return { type: "link", url, children: [text(label)] };
}

/**
 * A navigation item as a list entry, with its section nested beneath it.
 *
 * A directory with no page of its own contributes its name as plain text: it
 * is a real part of the structure and leaving it out would flatten the tree,
 * but it has nowhere to link to and pretending otherwise produces a link that
 * goes nowhere.
 */
function itemToListItem(item: NavigationItem, basePath: string): ListItemNode {
  const label: InlineNode =
    item.route === undefined
      ? { type: "strong", children: [text(item.label)] }
      : link(`${basePath}${encodeRoutePath(item.route)}`, item.label);

  const line =
    item.description === undefined
      ? paragraph(label)
      : paragraph(label, text(`: ${item.description}`));

  return {
    type: "list-item",
    children:
      item.children.length === 0
        ? [line]
        : [
            line,
            {
              type: "list",
              ordered: false,
              children: item.children.map((child) =>
                itemToListItem(child, basePath),
              ),
            },
          ],
  };
}

function navigationList(
  items: readonly NavigationItem[],
  basePath: string,
): BlockNode {
  return {
    type: "list",
    ordered: false,
    children: items.map((item) => itemToListItem(item, basePath)),
  };
}

export interface GeneratedHomeInput {
  readonly siteName: string;
  readonly navigation: readonly NavigationItem[];
  readonly basePath?: string;
}

/**
 * The landing page shown when the documentation root has no index document.
 *
 * It says what it is. A reader who wonders why this page exists, and an author
 * who wants a different one, both get the same answer in one sentence — which
 * is cheaper than either of them going looking for it.
 */
export function generateHomeDocument(input: GeneratedHomeInput): DocumentNode {
  if (input.navigation.length === 0) {
    return {
      type: "document",
      children: [
        { type: "heading", depth: 1, children: [text(input.siteName)] },
        paragraph(
          text(
            "This documentation root has no documents yet. Add a Markdown or HTML file to it, then reload: ",
          ),
          { type: "inline-code", value: "index.md" },
          text(" becomes this page."),
        ),
      ],
    };
  }

  return {
    type: "document",
    children: [
      { type: "heading", depth: 1, children: [text(input.siteName)] },
      paragraph(
        text("This page lists the documents in this project. Add an "),
        { type: "inline-code", value: "index.md" },
        text(" to the documentation root to write your own."),
      ),
      navigationList(input.navigation, input.basePath ?? ""),
    ],
  };
}

export interface GeneratedNotFoundInput {
  readonly requestedPath: string;
  readonly navigation: readonly NavigationItem[];
  readonly basePath?: string;
}

/**
 * The page shown when a request does not resolve to a document.
 *
 * The path is echoed so the reader can see what was actually asked for —
 * escaped, like every other piece of text on a page, because it came from a
 * client. What is *not* echoed is anything about the file system: a 404 that
 * names directories tells whoever is probing where to look next.
 */
export function generateNotFoundDocument(
  input: GeneratedNotFoundInput,
): DocumentNode {
  const children: BlockNode[] = [
    { type: "heading", depth: 1, children: [text("Page not found")] },
    paragraph(
      text("No document is served at "),
      { type: "inline-code", value: input.requestedPath },
      text("."),
    ),
  ];

  if (input.navigation.length === 0) {
    children.push(
      paragraph(text("This project has no documents to link to yet.")),
    );
    return { type: "document", children };
  }

  children.push(
    paragraph(text("These sections exist:")),
    navigationList(input.navigation, input.basePath ?? ""),
  );

  return { type: "document", children };
}

export interface GeneratedSearchInput {
  readonly query?: string;
  readonly navigation: readonly NavigationItem[];
  readonly basePath?: string;
}

/**
 * The search page.
 *
 * It exists so the search field is a control that does something before any
 * script runs: submitting it lands here, on a page that lists everything the
 * project contains. With the script running, results appear in the field
 * instead and this page is rarely seen — but "rarely seen" is not "never", and
 * a form that submits into nothing is a broken form.
 *
 * It deliberately does not try to answer the query. Matching belongs in one
 * place, and duplicating it here in a second implementation is how two searches
 * start disagreeing about what matches.
 */
export function generateSearchDocument(
  input: GeneratedSearchInput,
): DocumentNode {
  const children: BlockNode[] = [
    { type: "heading", depth: 1, children: [text("Search")] },
  ];

  if (input.query !== undefined && input.query.trim() !== "") {
    children.push(
      paragraph(
        text("Searching for "),
        { type: "inline-code", value: input.query.trim() },
        text(
          " needs JavaScript, which is not running. Everything this project contains is listed below.",
        ),
      ),
    );
  } else {
    children.push(
      paragraph(text("Everything this project contains is listed below.")),
    );
  }

  if (input.navigation.length > 0) {
    children.push(navigationList(input.navigation, input.basePath ?? ""));
  }

  return { type: "document", children };
}

/**
 * The page shown for a request path that cannot be decoded at all.
 *
 * A malformed percent-sequence, or one that decodes to a traversal, is
 * something a client sent — so it is a bad request, and the page says so
 * without repeating the address back. Echoing input that failed validation is
 * how a 400 page becomes a reflection point.
 */
export function generateBadRequestDocument(): DocumentNode {
  return {
    type: "document",
    children: [
      { type: "heading", depth: 1, children: [text("Bad request")] },
      paragraph(
        text(
          "That address is not a documentation path this server can read. Check the link and try again, or start from the ",
        ),
        link("/", "home page"),
        text("."),
      ),
    ],
  };
}
