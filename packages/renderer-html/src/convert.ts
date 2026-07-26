import type {
  BlockNode,
  DocumentDiagnostic,
  InlineNode,
  SourcePath,
  SourceRange,
  TableAlignment,
} from "@tsumugu/core";
import type { Element, Nodes as HastNode, RootContent } from "hast";

/**
 * hast to Semantic AST.
 *
 * Every hast type in the repository is imported here and nowhere else, exactly
 * as the Markdown renderer confines mdast. That is what lets HTML be a
 * first-class input rather than a second format bolted on: both formats
 * converge on one tree, and neither parser is visible past this file.
 */

export const htmlCodes = {
  scriptRemoved: "renderer-html/script-removed",
  unsupported: "renderer-html/unsupported-element",
} as const;

export interface ConversionResult {
  readonly children: readonly BlockNode[];
  readonly diagnostics: readonly DocumentDiagnostic[];
}

interface Conversion {
  readonly sourcePath: SourcePath;
  readonly source: string;
  readonly diagnostics: DocumentDiagnostic[];
  /** Scripts are reported once, not once per occurrence. */
  scriptsReported: boolean;
  /** Likewise for elements with no semantic equivalent. */
  unsupportedReported: boolean;
}

/**
 * Elements whose own meaning the AST does not model, but whose content matters.
 *
 * Grouping and landmark elements describe page structure, and page structure is
 * core's job through the application shell rather than the document's. Their
 * children pass through so nothing is lost; the wrapper itself is not
 * represented.
 */
const transparentElements = new Set([
  "div",
  "span",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "nav",
  "aside",
  "figure",
  "figcaption",
  "hgroup",
  "body",
  "html",
  "template",
  "font",
  "center",
]);

/**
 * Elements dropped without a word.
 *
 * Document metadata and stylesheet links say nothing about content, and
 * reporting each one would train a reader to ignore diagnostics.
 */
const silentlyDropped = new Set([
  "head",
  "meta",
  "link",
  "base",
  "title",
  "style",
]);

/**
 * Elements that belong inside a line of prose.
 *
 * HTML lets these sit at block level with no wrapper, and a browser gives them
 * an implied paragraph. Without that, a bare `<a href="...">` at the top of a
 * fragment would fall through to the unknown-element path and be preserved as
 * raw markup — turning a perfectly ordinary link into opaque HTML.
 */
const inlineElements = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "cite",
  "code",
  "data",
  "del",
  "dfn",
  "em",
  "i",
  "img",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "wbr",
]);

/** Whether a node belongs in a paragraph rather than standing on its own. */
function isInlineLevel(node: RootContent): boolean {
  if (node.type === "text") {
    return node.value.trim() !== "";
  }
  return isElement(node) && inlineElements.has(node.tagName.toLowerCase());
}

const headingDepths: Readonly<Record<string, 1 | 2 | 3 | 4 | 5 | 6>> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

function rangeOf(node: HastNode): { range?: SourceRange } {
  const position = node.position;
  if (position === undefined) {
    return {};
  }
  return {
    range: {
      start: {
        line: position.start.line,
        column: position.start.column,
        offset: position.start.offset ?? 0,
      },
      end: {
        line: position.end.line,
        column: position.end.column,
        offset: position.end.offset ?? 0,
      },
    },
  };
}

function childrenOf(node: HastNode): readonly RootContent[] {
  return "children" in node ? node.children : [];
}

/** A property as a plain string, or `undefined`. hast values are loosely typed. */
function stringProperty(element: Element, name: string): string | undefined {
  const value = element.properties[name];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(" ");
  }
  return undefined;
}

/** The original source of a node, so nothing preserved is invented. */
function sourceOf(conversion: Conversion, node: HastNode): string {
  const position = node.position;
  if (
    position?.start.offset === undefined ||
    position.end.offset === undefined
  ) {
    return "";
  }
  return conversion.source.slice(position.start.offset, position.end.offset);
}

function preservedHtml(
  conversion: Conversion,
  node: HastNode,
  placement: "block" | "inline",
): BlockNode & InlineNode {
  const value = sourceOf(conversion, node);
  return {
    type: "raw-html",
    // Preserved rather than dropped: HTML that has no semantic equivalent is
    // still the author's content. Whether any of it reaches the page is the
    // serializer's decision under the security policy.
    value,
    trust: "untrusted",
    placement,
    ...rangeOf(node),
  };
}

function isElement(node: HastNode): node is Element {
  return node.type === "element";
}

/** Column alignment from a cell's `align` attribute or inline text-align. */
function alignmentOf(element: Element): TableAlignment | undefined {
  const align = stringProperty(element, "align")?.toLowerCase();
  if (align === "left" || align === "right" || align === "center") {
    return align;
  }
  const style = stringProperty(element, "style")?.toLowerCase() ?? "";
  for (const candidate of ["left", "right", "center"] as const) {
    if (
      style.includes(`text-align:${candidate}`) ||
      style.includes(`text-align: ${candidate}`)
    ) {
      return candidate;
    }
  }
  return undefined;
}

/** The language a `<pre><code class="language-ts">` declares, if any. */
function codeLanguage(element: Element): string | undefined {
  const className = stringProperty(element, "className") ?? "";
  const match = /(?:^|\s)(?:language|lang)-([^\s]+)/.exec(className);
  return match?.[1];
}

/** Concatenated text of a subtree, for elements whose content is raw text. */
function textOf(node: HastNode): string {
  if (node.type === "text") {
    return node.value;
  }
  return childrenOf(node)
    .map((child) => textOf(child))
    .join("");
}

/**
 * Converts a run of nodes, giving consecutive inline content an implied
 * paragraph.
 *
 * This is what a browser does, and what Markdown does with a bare line of
 * text. Grouping the run rather than wrapping each node keeps `a <b>bold</b>
 * word` as one paragraph instead of three.
 */
function blocks(
  conversion: Conversion,
  nodes: readonly RootContent[],
): BlockNode[] {
  const result: BlockNode[] = [];
  let run: RootContent[] = [];

  const flush = (): void => {
    if (run.length === 0) {
      return;
    }
    const children = inlines(conversion, run);
    if (children.length > 0) {
      result.push({ type: "paragraph", children });
    }
    run = [];
  };

  for (const node of nodes) {
    if (isInlineLevel(node)) {
      run.push(node);
      continue;
    }
    flush();
    result.push(...block(conversion, node));
  }
  flush();

  return result;
}

function inlines(
  conversion: Conversion,
  nodes: readonly RootContent[],
): InlineNode[] {
  return nodes.flatMap((node) => inline(conversion, node));
}

function dropScript(conversion: Conversion, node: HastNode): void {
  if (conversion.scriptsReported) {
    return;
  }
  conversion.scriptsReported = true;
  conversion.diagnostics.push({
    code: htmlCodes.scriptRemoved,
    severity: "warning",
    stage: "renderer",
    message: `Script content in "${conversion.sourcePath}" was removed.`,
    hint: "Documentation JavaScript is disabled by default. A future interactive mode will need an explicit, isolated trust boundary.",
    sourcePath: conversion.sourcePath,
    ...rangeOf(node),
  });
}

/**
 * Reports unsupported elements once per document.
 *
 * A page built from custom elements should not bury every other diagnostic
 * under one report per tag, but an author does deserve to know that their
 * `<custom-widget>` arrives as preserved markup rather than as a styled node.
 */
function reportUnsupported(
  conversion: Conversion,
  node: HastNode,
  tag: string,
): void {
  if (conversion.unsupportedReported) {
    return;
  }
  conversion.unsupportedReported = true;
  conversion.diagnostics.push({
    code: htmlCodes.unsupported,
    severity: "warning",
    stage: "renderer",
    message: `"${conversion.sourcePath}" uses <${tag}>, which has no semantic equivalent.`,
    hint: "Its markup is preserved as untrusted content rather than dropped. What reaches the page is decided when output is written.",
    sourcePath: conversion.sourcePath,
    ...rangeOf(node),
  });
}

function block(conversion: Conversion, node: RootContent): BlockNode[] {
  if (node.type === "text") {
    // Whitespace between block elements carries no meaning. Text with content
    // never reaches here: blocks() has already grouped it into a paragraph.
    return [];
  }
  if (node.type === "comment" || node.type === "doctype") {
    return [];
  }
  if (!isElement(node)) {
    return [];
  }

  const tag = node.tagName.toLowerCase();

  if (tag === "script" || tag === "noscript") {
    dropScript(conversion, node);
    return [];
  }
  if (silentlyDropped.has(tag)) {
    return [];
  }
  if (transparentElements.has(tag)) {
    return blocks(conversion, node.children);
  }

  const depth = headingDepths[tag];
  if (depth !== undefined) {
    return [
      {
        type: "heading",
        depth,
        children: inlines(conversion, node.children),
        ...rangeOf(node),
      },
    ];
  }

  switch (tag) {
    case "p":
      return [
        {
          type: "paragraph",
          children: inlines(conversion, node.children),
          ...rangeOf(node),
        },
      ];

    case "pre": {
      const code = node.children.find(
        (child) => isElement(child) && child.tagName.toLowerCase() === "code",
      );
      const target = code !== undefined && isElement(code) ? code : node;
      const language = isElement(target) ? codeLanguage(target) : undefined;
      return [
        {
          type: "code-block",
          value: textOf(target),
          ...(language === undefined ? {} : { language }),
          ...rangeOf(node),
        },
      ];
    }

    case "ul":
    case "ol":
      return [
        {
          type: "list",
          ordered: tag === "ol",
          ...(() => {
            const start = Number(stringProperty(node, "start"));
            return tag === "ol" && Number.isInteger(start) && start !== 1
              ? { start }
              : {};
          })(),
          children: node.children.flatMap((child) =>
            isElement(child) && child.tagName.toLowerCase() === "li"
              ? [
                  {
                    type: "list-item" as const,
                    // A list item holds blocks, so a nested list survives.
                    // Loose text inside one becomes a paragraph.
                    children: blocks(conversion, child.children),
                    ...rangeOf(child),
                  },
                ]
              : [],
          ),
          ...rangeOf(node),
        },
      ];

    case "blockquote":
      return [
        {
          type: "blockquote",
          children: blocks(conversion, node.children),
          ...rangeOf(node),
        },
      ];

    case "hr":
      return [{ type: "thematic-break", ...rangeOf(node) }];

    case "table":
      return [table(conversion, node)];

    default:
      // A custom element, or one the AST has no node for. Its source is kept
      // rather than dropped, and marked untrusted.
      reportUnsupported(conversion, node, tag);
      return [preservedHtml(conversion, node, "block")];
  }
}

/** Rows of a table, looking through the optional grouping elements. */
function tableRows(node: Element): Element[] {
  const rows: Element[] = [];
  for (const child of node.children) {
    if (!isElement(child)) {
      continue;
    }
    const tag = child.tagName.toLowerCase();
    if (tag === "tr") {
      rows.push(child);
    } else if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
      rows.push(...tableRows(child));
    }
  }
  return rows;
}

function table(conversion: Conversion, node: Element): BlockNode {
  const rows = tableRows(node);
  const cellsOf = (row: Element): Element[] =>
    row.children.filter(
      (child): child is Element =>
        isElement(child) && ["th", "td"].includes(child.tagName.toLowerCase()),
    );

  // Alignment is per column, taken from the first row that declares any.
  const columns = Math.max(0, ...rows.map((row) => cellsOf(row).length));
  const align: (TableAlignment | undefined)[] = Array.from(
    { length: columns },
    (_unused, index) => {
      for (const row of rows) {
        const cell = cellsOf(row)[index];
        const found = cell === undefined ? undefined : alignmentOf(cell);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    },
  );

  return {
    type: "table",
    align,
    children: rows.map((row) => {
      const cells = cellsOf(row);
      return {
        type: "table-row" as const,
        // A row of <th> labels its columns, which is what a screen reader and
        // a data export both need — independently of thead grouping.
        header:
          cells.length > 0 &&
          cells.every((cell) => cell.tagName.toLowerCase() === "th"),
        children: cells.map((cell) => ({
          type: "table-cell" as const,
          children: inlines(conversion, cell.children),
          ...rangeOf(cell),
        })),
        ...rangeOf(row),
      };
    }),
    ...rangeOf(node),
  };
}

function inline(conversion: Conversion, node: RootContent): InlineNode[] {
  if (node.type === "text") {
    return node.value === ""
      ? []
      : [{ type: "text", value: node.value, ...rangeOf(node) }];
  }
  if (node.type === "comment" || node.type === "doctype") {
    return [];
  }
  if (!isElement(node)) {
    return [];
  }

  const tag = node.tagName.toLowerCase();

  if (tag === "script" || tag === "noscript") {
    dropScript(conversion, node);
    return [];
  }
  if (silentlyDropped.has(tag)) {
    return [];
  }
  if (transparentElements.has(tag)) {
    return inlines(conversion, node.children);
  }

  switch (tag) {
    case "em":
    case "i":
      return [
        {
          type: "emphasis",
          children: inlines(conversion, node.children),
          ...rangeOf(node),
        },
      ];

    case "strong":
    case "b":
      return [
        {
          type: "strong",
          children: inlines(conversion, node.children),
          ...rangeOf(node),
        },
      ];

    case "code":
    case "kbd":
    case "samp":
      return [{ type: "inline-code", value: textOf(node), ...rangeOf(node) }];

    case "a":
      return [
        {
          type: "link",
          // Exactly as written, including a scheme the serializer may later
          // refuse. Dropping it here would hide it from the diagnostics whose
          // job is to report it.
          url: stringProperty(node, "href") ?? "",
          ...(stringProperty(node, "title") === undefined
            ? {}
            : { title: stringProperty(node, "title") ?? "" }),
          children: inlines(conversion, node.children),
          ...rangeOf(node),
        },
      ];

    case "img":
      return [
        {
          type: "image",
          url: stringProperty(node, "src") ?? "",
          // Required by the AST. A missing alt becomes an empty string, which
          // marks the image decorative — the same convention as Markdown.
          alt: stringProperty(node, "alt") ?? "",
          ...(stringProperty(node, "title") === undefined
            ? {}
            : { title: stringProperty(node, "title") ?? "" }),
          ...rangeOf(node),
        },
      ];

    default:
      reportUnsupported(conversion, node, tag);
      return [preservedHtml(conversion, node, "inline")];
  }
}

/** Converts parsed HTML content into Semantic AST blocks. */
export function convertToSemanticAst(
  nodes: readonly RootContent[],
  sourcePath: SourcePath,
  source: string,
): ConversionResult {
  const conversion: Conversion = {
    sourcePath,
    source,
    diagnostics: [],
    scriptsReported: false,
    unsupportedReported: false,
  };

  return {
    children: blocks(conversion, nodes),
    diagnostics: conversion.diagnostics,
  };
}
