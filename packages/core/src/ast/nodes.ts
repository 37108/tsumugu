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
  /** Natural language of this part when it differs from its document. */
  readonly lang?: string;
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
  /**
   * The heading's identifier, used as a URL fragment.
   *
   * A renderer sets this only when the source stated one, such as an HTML
   * `id` attribute. Every other heading gets one from the heading-id
   * transformer, so a theme reading this field can rely on it being resolved
   * and unique — or absent, when no transformer ran and the document simply
   * has no anchors.
   */
  readonly id?: string;
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

/**
 * One run of code that shares a colour.
 *
 * Text and presentation are separate fields on purpose: `value` is what the
 * author wrote and what a copy button, a search index or an AI export reads,
 * and it is escaped like any other text when it is rendered. Nothing here is
 * markup, so a highlighter cannot inject any.
 */
export interface CodeToken {
  readonly value: string;
  /** Colour for a light background, as a CSS colour. */
  readonly color?: string;
  /** Colour for a dark background, when the highlighter offered one. */
  readonly darkColor?: string;
  readonly fontStyle?: "italic" | "bold" | "underline";
}

/** A line of code, as tokens. Empty for a blank line. */
export type CodeLine = readonly CodeToken[];

export interface CodeBlockNode extends NodeBase {
  readonly type: "code-block";
  readonly value: string;
  /**
   * The language as the author wrote it, unnormalized, or `undefined` when the
   * source gave none. Highlighting is a transformer's job; this only records
   * what the document said.
   */
  readonly language?: string;
  /**
   * Tokens produced by a highlighting transformer, when one ran.
   *
   * `value` above stays exactly as the author wrote it, so removing the
   * transformer removes the colour and nothing else. A theme that finds no
   * tokens renders the plain text, which is what makes highlighting optional
   * rather than assumed.
   */
  readonly highlighted?: readonly CodeLine[];
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
  /** Whether this is an unchecked or checked task, or a plain list item. */
  readonly checked?: boolean;
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
 * Everything in this node starts **untrusted**. It was authored in a
 * documentation file, which is content, not application code. The serializer
 * decides what may be emitted; nothing here may be assumed safe to inject into
 * the page shell.
 */
export interface RawHtmlNode extends NodeBase {
  readonly type: "raw-html";
  readonly value: string;
  /**
   * Renderers only ever produce `"untrusted"`: documentation-authored markup
   * is content, and the theme's own markup is a Virtual Tree instead. The one
   * way a node becomes `"trusted"` is the operator's `--trust` declaration,
   * applied by the pipeline (ADR 7). The field is present so a consumer has to
   * acknowledge the distinction rather than infer it from the node's name.
   */
  readonly trust: "untrusted" | "trusted";
  /** Whether the fragment stands alone or sits inside a line of prose. */
  readonly placement: "block" | "inline";
}

/**
 * A figure Tsumugu drew, from text the author wrote inside the document.
 *
 * The node carries the finished figure rather than the shapes it is made of.
 * Coordinates are how a figure is laid out, and the Semantic AST describes what
 * a document means — so layout belongs to whatever produced the drawing, and a
 * theme presents the result without owning a drawing implementation (ADR 9).
 *
 * `svg` is Tsumugu's own markup, not the author's. It is produced by a
 * transformer from the author's *text*, exactly as a theme produces markup from
 * a tree, which is why it is emitted rather than escaped and why doing so does
 * not widen what the operator's `--trust` declaration covers (ADR 7).
 *
 * `source` stays on the node after the figure exists. A reader who cannot see
 * the figure, a search index and an AI export all need the diagram as text, and
 * regenerating it from the drawing would be impossible.
 */
export interface DiagramNode extends NodeBase {
  readonly type: "diagram";
  /** The syntax the source was written in. */
  readonly dialect: "mermaid";
  /**
   * Identity within its document, assigned by whatever produced the figure.
   *
   * A figure's name and description are separate elements that the figure has
   * to point at, so two figures on one page must be able to tell each other
   * apart. Only the producer sees the whole document, so only the producer can
   * number them — the same reason `HeadingNode` carries an id. A theme that
   * finds none falls back to the figure's contents, which is unique in every
   * case except two byte-identical diagrams on one page.
   */
  readonly id?: string;
  /** The figure's contents: SVG children, without the `svg` element itself. */
  readonly svg: string;
  /** The figure's own coordinate space, so a theme can scale it. */
  readonly width: number;
  readonly height: number;
  /**
   * Accessible name. Never empty: a figure nothing can name is a figure a
   * screen-reader user is told nothing about.
   */
  readonly title: string;
  /** What the figure shows, for a reader who cannot see it. */
  readonly description: string;
  /** The text the figure was drawn from. */
  readonly source: string;
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
  | DiagramNode
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
