import type { SemanticNode } from "../ast/nodes.js";
import type { DocumentDiagnostic } from "../document/diagnostics.js";
import type { SourcePath } from "../document/paths.js";
import type { ResolvedMetadata } from "../metadata/resolve.js";
import { element, fragment, text, type VirtualNode } from "./virtual-tree.js";

/**
 * The theme contract: Semantic AST in, Virtual Tree out.
 *
 * A theme decides what a heading, a list or a table *looks like*. It does not
 * decide where the page lives, what surrounds it, or how it is delivered.
 *
 * | Concern | Owner |
 * | --- | --- |
 * | headings, paragraphs, lists, code, tables, links, images | **theme** |
 * | the page shell: header, sidebar, footer, table of contents | core |
 * | navigation structure and ordering | core |
 * | routing, request handling, status codes | core |
 * | parsing source into the AST | renderers |
 *
 * The split is what lets a theme be replaced without the replacement having to
 * understand scanning, routing or HTTP — and what stops a theme from quietly
 * becoming the application.
 *
 * A theme is a plain object of functions. There is no base class, no
 * inheritance and no lifecycle: a theme that needs to build on another one
 * composes its renderers, which is ordinary function composition rather than a
 * framework feature.
 */

/** What a node renderer is given. */
export interface RenderContext {
  /** Renders a child node. The only way a renderer descends. */
  readonly renderChild: (node: SemanticNode) => VirtualNode;
  /** Resolved document metadata: title, description, ordering, visibility. */
  readonly metadata: ResolvedMetadata;
  /** Which file this document came from, for diagnostics. */
  readonly sourcePath: SourcePath;
  /** Reports a problem without failing the page. */
  readonly report: (diagnostic: DocumentDiagnostic) => void;
}

/**
 * Renders one node.
 *
 * Returning a Virtual Tree rather than a string is what makes escaping the
 * serializer's job instead of every renderer's.
 */
export type NodeRenderer = (
  node: SemanticNode,
  context: RenderContext,
) => VirtualNode;

/**
 * A theme.
 *
 * `renderers` is keyed by AST node type. A theme need not implement every one:
 * anything missing falls back to the documented default below, so adding a node
 * to the AST does not break every theme at once.
 */
export interface Theme {
  readonly id: string;
  readonly renderers: Partial<Record<SemanticNode["type"], NodeRenderer>>;
  /**
   * CSS for the document content this theme renders.
   *
   * A theme owns how a heading or a table looks, so it owns the rules that say
   * so; the shell places them in the page. Stated as text rather than as a file
   * because a documentation server has no asset pipeline and should not need
   * one to show a styled page — and because a stylesheet that has to be
   * fetched is a page that is unstyled until it arrives.
   *
   * A theme that only wants correct HTML omits it.
   */
  readonly stylesheet?: string;
}

export const themeCodes = {
  missingRenderer: "theme/missing-renderer",
  rendererThrew: "theme/renderer-threw",
  unsupportedNode: "theme/unsupported-node",
} as const;

export interface ThemeRenderInput {
  readonly root: SemanticNode;
  readonly metadata: ResolvedMetadata;
  readonly sourcePath: SourcePath;
}

export interface ThemeRenderResult {
  readonly tree: VirtualNode;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

/**
 * The fallback used when a theme has no renderer for a node.
 *
 * It renders the node's children and nothing else, which keeps the document's
 * content visible even though its presentation is wrong. The alternative —
 * dropping the subtree — hides an author's writing because a theme has a gap,
 * and that is the worse failure for a documentation tool.
 *
 * A diagnostic names both the theme and the node, because "a paragraph looked
 * odd" is not something a user can report usefully.
 */
function fallbackRenderer(
  themeId: string,
  node: SemanticNode,
  context: RenderContext,
  children: readonly SemanticNode[],
): VirtualNode {
  context.report({
    code: themeCodes.missingRenderer,
    severity: "warning",
    stage: "theme",
    message: `Theme "${themeId}" has no renderer for a "${node.type}" node.`,
    hint: "Its content is still shown, without the presentation the theme would have given it.",
    sourcePath: context.sourcePath,
    ...(node.range === undefined ? {} : { range: node.range }),
  });

  return fallbackContent(node, context, children);
}

/**
 * The content a node contributes when nothing renders it.
 *
 * A node with children contributes them. A **leaf** contributes its own text —
 * and that case is the one that matters: text, code and image nodes are where
 * a document's content actually lives, and they have no children to fall back
 * to. Rendering only children would silently empty the page for precisely the
 * nodes worth keeping.
 *
 * Preserved raw markup contributes its source as escaped text. It is visibly
 * wrong, which is the correct signal that the theme has a gap, and it is
 * lossless — which matters more. It is never emitted as markup: the trust
 * decision belongs to a theme that deliberately made it, not to a fallback.
 */
function fallbackContent(
  node: SemanticNode,
  context: RenderContext,
  children: readonly SemanticNode[],
): VirtualNode {
  if (children.length > 0) {
    return fragment(...children.map((child) => context.renderChild(child)));
  }

  switch (node.type) {
    case "text":
    case "inline-code":
    case "code-block":
    case "unsupported":
    case "raw-html":
      return text(node.value);
    case "image":
      // Alternative text is what a reader without the image receives.
      return text(node.alt);
    default:
      return fragment();
  }
}

function childrenOfNode(node: SemanticNode): readonly SemanticNode[] {
  return "children" in node ? node.children : [];
}

/**
 * Renders a document with a theme.
 *
 * A renderer that throws costs its own node, not the page: the failure becomes
 * a diagnostic and that node renders as its children. A documentation server
 * that returns nothing because one table was awkward is less useful than one
 * that shows the table badly and says so.
 */
export function renderWithTheme(
  theme: Theme,
  input: ThemeRenderInput,
): ThemeRenderResult {
  const diagnostics: DocumentDiagnostic[] = [];

  const context: RenderContext = {
    metadata: input.metadata,
    sourcePath: input.sourcePath,
    report: (diagnostic) => {
      diagnostics.push(diagnostic);
    },
    renderChild: (node) => renderNode(node),
  };

  function renderNode(node: SemanticNode): VirtualNode {
    const renderer = theme.renderers[node.type];
    const children = childrenOfNode(node);

    if (renderer === undefined) {
      return fallbackRenderer(theme.id, node, context, children);
    }

    try {
      return renderer(node, context);
    } catch (cause) {
      diagnostics.push({
        code: themeCodes.rendererThrew,
        severity: "error",
        stage: "theme",
        message: `Theme "${theme.id}" failed rendering a "${node.type}" node: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        hint: "The node's content is still shown, without its presentation.",
        sourcePath: input.sourcePath,
        ...(node.range === undefined ? {} : { range: node.range }),
        cause,
      });
      return fallbackContent(node, context, children);
    }
  }

  return { tree: renderNode(input.root), diagnostics };
}

/**
 * Renders an AST node that the theme should not present at all.
 *
 * `unsupported` nodes carry source a renderer could not represent. Showing it
 * as preformatted text keeps the author's content on the page, visibly
 * unstyled, rather than silently losing it.
 */
export function renderUnsupported(
  node: SemanticNode,
  context: RenderContext,
): VirtualNode {
  if (node.type !== "unsupported") {
    return fragment();
  }

  context.report({
    code: themeCodes.unsupportedNode,
    severity: "warning",
    stage: "theme",
    message: `Content could not be represented: ${node.reason}`,
    hint: "The original source is shown as preformatted text so nothing is lost.",
    sourcePath: context.sourcePath,
    ...(node.range === undefined ? {} : { range: node.range }),
  });

  return element(
    "pre",
    { "data-tsumugu-unsupported": "true" },
    text(node.value),
  );
}
