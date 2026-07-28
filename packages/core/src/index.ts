/**
 * The public surface of `@tsumugu/core`.
 *
 * Almost everything here is a **type**. That is the point: the first real
 * consumer — the Markdown renderer — needs to describe the shape of what it
 * produces, and needs nothing from core at runtime. A contract that costs no
 * runtime coupling is the cheapest kind to keep.
 *
 * `docs/principles.md` says public APIs are earned. Each export below exists
 * because a package outside core could not be written without it, not because
 * it might be useful. The document model, the scanner, routing, the serializer
 * and the theme runtime all remain internal until something outside core needs
 * them.
 */

/** Version of the Tsumugu core package. */
export { version } from "./version.js";

// The Semantic AST: what a renderer produces and a theme consumes.
export type {
  BlockNode,
  BlockquoteNode,
  CodeBlockNode,
  DocumentNode,
  EmphasisNode,
  HeadingNode,
  ImageNode,
  InlineCodeNode,
  InlineNode,
  LinkNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  RawHtmlNode,
  SemanticNode,
  SemanticNodeType,
  SourcePoint,
  SourceRange,
  StrongNode,
  TableAlignment,
  TableCellNode,
  TableNode,
  TableRowNode,
  TextNode,
  ThematicBreakNode,
  UnsupportedNode,
} from "./ast/nodes.js";

// The renderer contract: what a renderer package implements.
export type { RenderResult, Renderer } from "./renderer/contract.js";

// Diagnostics: how any stage reports a problem.
export {
  formatDiagnostic,
  formatDiagnostics,
  summarizeDiagnostics,
} from "./document/diagnostics.js";
export type {
  DiagnosticSeverity,
  DocumentDiagnostic,
  PipelineStage,
  RelatedLocation,
} from "./document/diagnostics.js";

// Document identity, as a renderer sees it.
export type {
  LoadedDocument,
  SourceFormat,
  SourcePath,
} from "./document/document.js";

// Metadata values a renderer may hand back for the shared precedence rules.
export type { MetadataValue } from "./document/metadata.js";
export type { ResolvedMetadata, TitleSource } from "./metadata/resolve.js";

// The theme contract, and the Virtual Tree builders a theme cannot be written
// without. `trustedHtml` is exported alongside the safe constructors on
// purpose: hiding it would not stop a theme emitting raw markup, it would only
// stop the deliberate, reviewable way of doing so.
export type {
  NodeRenderer,
  RenderContext,
  Theme,
  ThemeRenderInput,
  ThemeRenderResult,
} from "./theme/contract.js";
// `renderWithTheme` and `serializeToHtml` are exported for the same reason the
// Virtual Tree builders are: a theme lives outside core, and its author cannot
// otherwise render one of their own nodes or see the HTML it becomes. Both are
// what the pipeline itself calls, so a theme is tested against the real thing.
export { renderUnsupported, renderWithTheme } from "./theme/contract.js";
export { serializeToHtml } from "./theme/serialize.js";
export type {
  AttributeValue,
  TrustedHtml,
  VirtualChild,
  VirtualElement,
  VirtualFragment,
  VirtualNode,
  VirtualText,
} from "./theme/virtual-tree.js";
export { element, fragment, text, trustedHtml } from "./theme/virtual-tree.js";

// The transformer contract, and the official heading-id transformer. Core
// provides the implementation; the composition root decides whether to run it,
// which is what keeps "core chooses nothing" true for anchors as well.
export type {
  TransformContext,
  TransformResult,
  Transformer,
} from "./transformer/contract.js";
export { createHeadingIdTransformer } from "./transformer/heading-ids.js";

// The pipeline and the development server: what an entry point composes.
export type {
  BuildOptions,
  BuildResult,
  Page,
  Site,
  UpdateSummary,
} from "./pipeline/site.js";
export { buildSite, createSite } from "./pipeline/site.js";
export type {
  RunningServer,
  ServedSite,
  ServeOptions,
} from "./server/serve.js";
export { serve } from "./server/serve.js";

// Live reload: the channel a development server holds, and the script a page
// carries. Both are opt-in, and the security model in `server/live-reload.ts`
// explains why that matters.
export type { ReloadChannel } from "./server/live-reload.js";
export {
  createReloadChannel,
  reloadPath,
  reloadScript,
} from "./server/live-reload.js";

// Watching, so a development entry point can rebuild without implementing its
// own debounce over a platform's file-system events.
export type { Watcher, WatchOptions } from "./scanner/watch.js";
export { watchRoot } from "./scanner/watch.js";
