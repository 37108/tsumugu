import type {
  BlockNode,
  DocumentDiagnostic,
  DocumentNode,
  InlineNode,
  SourcePath,
  SourceRange,
  TableAlignment,
} from "tsumugu-core";
import type { Nodes as MdastNode, Parent as MdastParent } from "mdast";

/**
 * mdast to Semantic AST.
 *
 * This file is the whole reason the Markdown renderer is its own package.
 * Every mdast type is imported here and nowhere else, so the parser can be
 * replaced without a single change to core or to a theme — which is what
 * `docs/architecture/overview.md` means when it says parser objects must not
 * leak.
 */

export const markdownCodes = {
  unsupported: "renderer-markdown/unsupported-construct",
} as const;

export interface ConversionResult {
  readonly root: DocumentNode;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

/**
 * State threaded through the conversion.
 *
 * A plain object and free functions rather than a class: the repository
 * prefers explicit functions over object hierarchies, and `erasableSyntaxOnly`
 * rules out parameter properties in any case.
 */
interface Conversion {
  readonly sourcePath: SourcePath;
  readonly source: string;
  readonly diagnostics: DocumentDiagnostic[];
}

function rangeOf(node: MdastNode): { range?: SourceRange } {
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

function childrenOf(node: MdastNode): readonly MdastNode[] {
  return "children" in node ? (node as MdastParent).children : [];
}

function alignmentOf(
  value: "left" | "right" | "center" | null | undefined,
): TableAlignment | undefined {
  return value === null || value === undefined ? undefined : value;
}

/** The original source of a node, so an unsupported construct is not lost. */
function sourceOf(conversion: Conversion, node: MdastNode): string {
  const position = node.position;
  if (
    position?.start.offset === undefined ||
    position.end.offset === undefined
  ) {
    return "";
  }
  return conversion.source.slice(position.start.offset, position.end.offset);
}

/**
 * Records a construct that has no semantic node, keeping the author's source.
 *
 * A gap in Tsumugu is not a mistake by the author, so the original text is
 * preserved rather than dropped, and a warning explains what happened.
 */
/**
 * Why a node the AST has no shape for is being preserved rather than rendered.
 *
 * MDX nodes get their own sentence, because "construct mdxFlowExpression is
 * not represented" reads like a gap where a policy is: expressions and
 * components are code, and documentation content does not execute — see
 * `docs/decisions/0006-mdx-without-execution.md`.
 */
function reasonFor(node: MdastNode): string {
  switch (node.type as string) {
    case "mdxFlowExpression":
    case "mdxTextExpression":
      return "MDX expressions are not executed; the expression is shown as written";
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement":
      return "JSX components are not executed; the markup is shown as written";
    case "mdxjsEsm":
      return "MDX imports and exports are not executed; the statement is shown as written";
    default:
      return `Markdown construct "${node.type}" is not represented yet`;
  }
}

function unsupported(
  conversion: Conversion,
  node: MdastNode,
  reason: string,
  placement: "block" | "inline",
): BlockNode & InlineNode {
  conversion.diagnostics.push({
    code: markdownCodes.unsupported,
    severity: "warning",
    stage: "renderer",
    message: `${reason} in "${conversion.sourcePath}".`,
    hint: "The original Markdown is kept and shown as written, so nothing is lost.",
    sourcePath: conversion.sourcePath,
    ...rangeOf(node),
  });

  return {
    type: "unsupported",
    reason,
    value: sourceOf(conversion, node),
    placement,
    ...rangeOf(node),
  };
}

function blocks(conversion: Conversion, node: MdastNode): BlockNode[] {
  return childrenOf(node).flatMap((child) => block(conversion, child));
}

function inlines(conversion: Conversion, node: MdastNode): InlineNode[] {
  return childrenOf(node).flatMap((child) => inline(conversion, child));
}

function block(conversion: Conversion, node: MdastNode): BlockNode[] {
  switch (node.type) {
    case "heading":
      return [
        {
          type: "heading",
          depth: node.depth,
          children: inlines(conversion, node),
          ...rangeOf(node),
        },
      ];

    case "paragraph":
      return [
        {
          type: "paragraph",
          children: inlines(conversion, node),
          ...rangeOf(node),
        },
      ];

    case "code":
      return [
        {
          type: "code-block",
          value: node.value,
          // The language exactly as the author wrote it. Normalizing here
          // would decide something highlighting should decide.
          ...(node.lang === null || node.lang === undefined
            ? {}
            : { language: node.lang }),
          ...rangeOf(node),
        },
      ];

    case "blockquote":
      return [
        {
          type: "blockquote",
          children: blocks(conversion, node),
          ...rangeOf(node),
        },
      ];

    case "list":
      return [
        {
          type: "list",
          ordered: node.ordered === true,
          // Recorded only when it says something: an ordered list starting at
          // 1 is the default, and an unordered list has no start.
          ...(node.ordered === true &&
          node.start !== null &&
          node.start !== undefined &&
          node.start !== 1
            ? { start: node.start }
            : {}),
          children: childrenOf(node).flatMap((child) =>
            child.type === "listItem"
              ? [
                  {
                    type: "list-item" as const,
                    children: blocks(conversion, child),
                    ...rangeOf(child),
                  },
                ]
              : [],
          ),
          ...rangeOf(node),
        },
      ];

    case "thematicBreak":
      return [{ type: "thematic-break", ...rangeOf(node) }];

    case "table":
      return [
        {
          type: "table",
          align: (node.align ?? []).map(alignmentOf),
          children: childrenOf(node).flatMap((row, index) =>
            row.type === "tableRow"
              ? [
                  {
                    type: "table-row" as const,
                    // GFM gives the first row the column labels.
                    header: index === 0,
                    children: childrenOf(row).flatMap((cell) =>
                      cell.type === "tableCell"
                        ? [
                            {
                              type: "table-cell" as const,
                              children: inlines(conversion, cell),
                              ...rangeOf(cell),
                            },
                          ]
                        : [],
                    ),
                    ...rangeOf(row),
                  },
                ]
              : [],
          ),
          ...rangeOf(node),
        },
      ];

    case "html":
      return [
        {
          type: "raw-html",
          value: node.value,
          // Authored in a documentation file, which is content, not
          // application code. What the serializer does with it is decided
          // under the security policy, not here.
          trust: "untrusted",
          placement: "block",
          ...rangeOf(node),
        },
      ];

    case "yaml":
      // Front matter is metadata, not content. It is read separately and must
      // not appear in the document body.
      return [];

    case "definition":
      return [
        unsupported(
          conversion,
          node,
          "Reference-style link definitions are not represented yet",
          "block",
        ),
      ];

    default:
      return [unsupported(conversion, node, reasonFor(node), "block")];
  }
}

function inline(conversion: Conversion, node: MdastNode): InlineNode[] {
  switch (node.type) {
    case "text":
      return [{ type: "text", value: node.value, ...rangeOf(node) }];

    case "emphasis":
      return [
        {
          type: "emphasis",
          children: inlines(conversion, node),
          ...rangeOf(node),
        },
      ];

    case "strong":
      return [
        {
          type: "strong",
          children: inlines(conversion, node),
          ...rangeOf(node),
        },
      ];

    case "inlineCode":
      return [{ type: "inline-code", value: node.value, ...rangeOf(node) }];

    case "link":
      return [
        {
          type: "link",
          // Exactly as written. Resolving relative links and rejecting
          // dangerous schemes happens later, where a diagnostic can report it
          // rather than a node silently disappearing.
          url: node.url,
          ...(node.title === null || node.title === undefined
            ? {}
            : { title: node.title }),
          children: inlines(conversion, node),
          ...rangeOf(node),
        },
      ];

    case "image":
      return [
        {
          type: "image",
          url: node.url,
          // Required by the AST, and an empty string is meaningful: it marks
          // the image decorative.
          alt: node.alt ?? "",
          ...(node.title === null || node.title === undefined
            ? {}
            : { title: node.title }),
          ...rangeOf(node),
        },
      ];

    case "html":
      return [
        {
          type: "raw-html",
          value: node.value,
          trust: "untrusted",
          placement: "inline",
          ...rangeOf(node),
        },
      ];

    case "break":
      return [
        unsupported(
          conversion,
          node,
          "Hard line breaks are not represented yet",
          "inline",
        ),
      ];

    default:
      return [unsupported(conversion, node, reasonFor(node), "inline")];
  }
}

/** Converts a parsed Markdown tree into the Semantic AST. */
export function convertToSemanticAst(
  root: MdastNode,
  sourcePath: SourcePath,
  source: string,
): ConversionResult {
  const conversion: Conversion = { sourcePath, source, diagnostics: [] };

  return {
    root: {
      type: "document",
      children: blocks(conversion, root),
      ...rangeOf(root),
    },
    diagnostics: conversion.diagnostics,
  };
}
