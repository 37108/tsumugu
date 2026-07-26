/**
 * The Semantic Document AST.
 *
 * This is the boundary that lets Markdown and HTML stop being different things.
 * Renderers produce it, transformers rewrite it, themes read it, and everything
 * downstream — navigation, tables of contents, search, link analysis, the
 * machine-readable exports — works on this rather than on a parser's output.
 *
 * Two failure modes shaped it:
 *
 * A tree that mirrors a browser DOM ties the architecture to HTML, and Markdown
 * has to be flattened into it. A tree that mirrors one Markdown parser ties it
 * to that parser, and HTML has to be flattened instead. So nodes describe what a
 * piece of a document *means* — a heading, a list, a quotation — and never how a
 * browser lays it out. There is no `div`, no `span`, and no `br`.
 *
 * The node set is deliberately small. A new node earns its place by preserving
 * meaning that existing nodes cannot express, not because an input parser
 * happens to emit a matching token.
 */

/** A position in a source file, as parsers report it. */
export interface SourcePoint {
  /** 1-based. */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
  /** 0-based character offset from the start of the file. */
  readonly offset: number;
}

export interface SourceRange {
  readonly start: SourcePoint;
  readonly end: SourcePoint;
}

/**
 * Fields every node may carry.
 *
 * `range` is optional because not every node comes from a parser that tracks
 * positions, and a node synthesised by a transformer has no source at all.
 * Diagnostics degrade to file-level when it is missing rather than being
 * impossible to produce.
 */
interface NodeBase {
  readonly range?: SourceRange;
}

/** The root of a document. */
export interface DocumentNode extends NodeBase {
  readonly type: "document";
  readonly children: readonly BlockNode[];
}

/**
 * A section heading.
 *
 * `depth` is the document's own outline level, not a font size. Themes decide
 * how a level looks; the level itself is what navigation, the table of contents
 * and assistive technology depend on.
 */
export interface HeadingNode extends NodeBase {
  readonly type: "heading";
  /** 1 to 6. */
  readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
  readonly children: readonly InlineNode[];
}

export interface ParagraphNode extends NodeBase {
  readonly type: "paragraph";
  readonly children: readonly InlineNode[];
}

/** Literal text. Always a leaf. */
export interface TextNode extends NodeBase {
  readonly type: "text";
  readonly value: string;
}

/** Stress emphasis. Rendered as italics by convention, not by definition. */
export interface EmphasisNode extends NodeBase {
  readonly type: "emphasis";
  readonly children: readonly InlineNode[];
}

/** Strong importance. */
export interface StrongNode extends NodeBase {
  readonly type: "strong";
  readonly children: readonly InlineNode[];
}

/** Code within a line of prose. */
export interface InlineCodeNode extends NodeBase {
  readonly type: "inline-code";
  readonly value: string;
}

export interface CodeBlockNode extends NodeBase {
  readonly type: "code-block";
  readonly value: string;
  /**
   * The language as the author wrote it, unnormalized, or `undefined` when the
   * source gave none. Highlighting is a transformer's job; this only records
   * what the document said.
   */
  readonly language?: string;
}

export interface ListNode extends NodeBase {
  readonly type: "list";
  readonly ordered: boolean;
  /**
   * First number of an ordered list, when the source specified one.
   * `undefined` for unordered lists and for ordered lists that start at 1.
   */
  readonly start?: number;
  readonly children: readonly ListItemNode[];
}

/**
 * One entry in a list.
 *
 * Children are blocks, not inlines: a list item can contain paragraphs, code and
 * nested lists. Modelling it as inline content would make nested lists
 * unrepresentable.
 */
export interface ListItemNode extends NodeBase {
  readonly type: "list-item";
  readonly children: readonly BlockNode[];
}

export interface LinkNode extends NodeBase {
  readonly type: "link";
  /**
   * The destination exactly as written. Resolving relative links and rejecting
   * dangerous URL schemes happen later, on purpose: this node records the
   * document, and a node that silently dropped a link would hide the problem
   * from the diagnostics that should report it.
   */
  readonly url: string;
  readonly title?: string;
  readonly children: readonly InlineNode[];
}

export interface ImageNode extends NodeBase {
  readonly type: "image";
  readonly url: string;
  /**
   * Alternative text. Required, and empty string is a meaningful value: it
   * marks the image as decorative. Making it optional would let a renderer omit
   * it by accident, which is the single most common accessibility failure in
   * generated documentation.
   */
  readonly alt: string;
  readonly title?: string;
}

export interface BlockquoteNode extends NodeBase {
  readonly type: "blockquote";
  readonly children: readonly BlockNode[];
}

export interface ThematicBreakNode extends NodeBase {
  readonly type: "thematic-break";
}

export interface TableNode extends NodeBase {
  readonly type: "table";
  /**
   * Column alignment, one entry per column. `undefined` means the source did
   * not specify one for that column.
   */
  readonly align: readonly (TableAlignment | undefined)[];
  readonly children: readonly TableRowNode[];
}

export type TableAlignment = "left" | "center" | "right";

export interface TableRowNode extends NodeBase {
  readonly type: "table-row";
  /**
   * Whether this row labels the columns. Kept as document meaning rather than
   * as a `thead` wrapper, because it is what a screen reader needs and what a
   * table-of-data export needs, independently of how it is marked up.
   */
  readonly header: boolean;
  readonly children: readonly TableCellNode[];
}

export interface TableCellNode extends NodeBase {
  readonly type: "table-cell";
  readonly children: readonly InlineNode[];
}

/**
 * Markup preserved verbatim from a documentation source.
 *
 * HTML is a first-class input, and some of it cannot be represented as meaning
 * without losing something. Rather than dropping it, it is carried through as
 * source text.
 *
 * Everything in this node is **untrusted**. It was authored in a documentation
 * file, which is content, not application code. The serializer decides what may
 * be emitted; nothing here may be assumed safe to inject into the page shell.
 */
export interface RawHtmlNode extends NodeBase {
  readonly type: "raw-html";
  readonly value: string;
  /**
   * Always `"untrusted"` today: only documentation-authored markup ever becomes
   * an AST node, and the theme's own markup is a Virtual Tree instead. The
   * field is present so a consumer has to acknowledge the distinction rather
   * than infer it from the node's name.
   */
  readonly trust: "untrusted";
  /** Whether the fragment stands alone or sits inside a line of prose. */
  readonly placement: "block" | "inline";
}

/**
 * Source that could not be represented, kept rather than discarded.
 *
 * A construct the AST has no node for is a gap in Tsumugu, not a mistake by the
 * author. Dropping it would make the tool quietly lossy; keeping the original
 * text lets the pipeline degrade gracefully and lets a diagnostic point at
 * something real.
 */
export interface UnsupportedNode extends NodeBase {
  readonly type: "unsupported";
  /** What could not be represented, for the diagnostic that reports it. */
  readonly reason: string;
  /** The original source text, so nothing is lost. */
  readonly value: string;
  readonly placement: "block" | "inline";
}

/** Nodes that stand on their own within a document's flow. */
export type BlockNode =
  | HeadingNode
  | ParagraphNode
  | CodeBlockNode
  | ListNode
  | BlockquoteNode
  | ThematicBreakNode
  | TableNode
  | RawHtmlNode
  | UnsupportedNode;

/** Nodes that appear within a line of prose. */
export type InlineNode =
  | TextNode
  | EmphasisNode
  | StrongNode
  | InlineCodeNode
  | LinkNode
  | ImageNode
  | RawHtmlNode
  | UnsupportedNode;

/**
 * Every node type.
 *
 * The `type` discriminant is exhaustive, so a consumer can switch over it and
 * have the compiler report any node it forgot when a new one is added.
 */
export type SemanticNode =
  | DocumentNode
  | BlockNode
  | InlineNode
  | ListItemNode
  | TableRowNode
  | TableCellNode;

/** A node's discriminant. */
export type SemanticNodeType = SemanticNode["type"];
