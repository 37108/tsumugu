import type { DocumentNode } from "../ast/nodes.js";
import type { DocumentDiagnostic } from "../document/diagnostics.js";
import {
  toDocumentMetadata,
  type MetadataValue,
} from "../document/metadata.js";
import {
  withDiagnostics,
  type LoadedDocument,
  type RenderedDocument,
} from "../document/document.js";

/**
 * The renderer contract: source document in, Semantic AST out.
 *
 * A renderer is a plain object with three members. There is no base class, no
 * lifecycle, no registration side effect and no dependency injection, because
 * none of those is needed to turn text into a tree — and each would have to be
 * supported forever once a third-party renderer relied on it.
 *
 * Options are deliberately absent. A renderer is *built* with its own options
 * and closes over them, so `tsumugu-core` never sees a Markdown setting and a
 * new renderer cannot force a field into core's configuration.
 *
 * Nothing here mentions themes, virtual trees, HTML or the server. A renderer
 * that knew about any of them could not be tested without them.
 */
export interface Renderer {
  /**
   * Stable identifier, used in diagnostics and to detect a registry that
   * registered the same renderer twice.
   */
  readonly id: string;

  /**
   * Whether this renderer can parse the document.
   *
   * Receives the whole document rather than just its extension, so a renderer
   * can decide on content — an HTML renderer distinguishing a full document
   * from a fragment, for instance. Extension is available through
   * `document.format` and is expected to be enough for most renderers, but it
   * is not the only mechanism.
   *
   * Must be free of side effects: it is called for every registered renderer.
   */
  supports(document: LoadedDocument): boolean;

  /**
   * Parses the document into the Semantic AST.
   *
   * May be synchronous or return a promise; the pipeline always awaits, so a
   * renderer needing no I/O should stay synchronous and pay nothing.
   *
   * Must be deterministic: the same content and options must produce the same
   * tree, or caching and incremental rebuilds become unsound.
   *
   * Should return diagnostics rather than throw. A thrown error is normalized
   * into one anyway, but a renderer that returns them can describe the problem
   * far better than a stack trace can.
   */
  render(document: LoadedDocument): RenderResult | Promise<RenderResult>;
}

export interface RenderResult {
  readonly root: DocumentNode;
  /**
   * Problems found while parsing. A warning here does not fail the document:
   * a page with one unsupported construct is still a page worth serving.
   */
  readonly diagnostics?: readonly DocumentDiagnostic[];
  /**
   * Metadata the source declared, as raw entries.
   *
   * Raw rather than resolved, because deciding what a title *is* — which of
   * front matter, an HTML title, a heading or the file name wins — is a shared
   * rule that must not be reimplemented per format. A renderer reports what it
   * found; the precedence rules decide what it means.
   */
  readonly metadata?: readonly (readonly [string, MetadataValue])[];
  /**
   * The document title a full HTML document declared, if the format has one.
   *
   * Its own field rather than a metadata entry because it sits at a different
   * level of the shared title precedence.
   */
  readonly htmlTitle?: string;
  /**
   * The text of each inline script the renderer preserved, in document order.
   *
   * Only a renderer built to preserve scripts — a composition the operator
   * declared trusted (ADR 7) — reports any. The server hashes each into the
   * page's `script-src`, which is how exactly these scripts run and an
   * injected one still does not.
   */
  readonly scripts?: readonly string[];
}

export const rendererCodes = {
  noRenderer: "renderer/none",
  ambiguous: "renderer/ambiguous",
  duplicateId: "renderer/duplicate-id",
  threw: "renderer/threw",
} as const;

/** Outcome of choosing a renderer for a document. */
export type RendererSelection =
  | { readonly kind: "selected"; readonly renderer: Renderer }
  | { readonly kind: "unresolved"; readonly diagnostic: DocumentDiagnostic };

/**
 * Chooses the renderer for a document.
 *
 * Selection is a pure function of the registered renderers and the document, in
 * registration order, so the same project always resolves the same way.
 *
 * **Ambiguity is an error, not a tie-break.** Two renderers claiming the same
 * document means the project is misconfigured, and picking the first would hide
 * that behind output that is subtly wrong and very hard to explain. The
 * diagnostic names the competing renderers so the fix is obvious.
 */
export function selectRenderer(
  renderers: readonly Renderer[],
  document: LoadedDocument,
): RendererSelection {
  const duplicate = findDuplicateId(renderers);
  if (duplicate !== undefined) {
    return {
      kind: "unresolved",
      diagnostic: {
        code: rendererCodes.duplicateId,
        severity: "error",
        stage: "renderer",
        message: `Two renderers are registered with the id "${duplicate}". Renderer ids identify them in diagnostics and must be unique.`,
        sourcePath: document.sourcePath,
      },
    };
  }

  const matches = renderers.filter((renderer) => renderer.supports(document));
  const first = matches[0];

  if (first === undefined) {
    return {
      kind: "unresolved",
      diagnostic: {
        code: rendererCodes.noRenderer,
        severity: "error",
        stage: "renderer",
        message: `No registered renderer handles "${document.sourcePath}" (format "${document.format}"). Registered: ${describeIds(renderers)}.`,
        sourcePath: document.sourcePath,
      },
    };
  }

  if (matches.length > 1) {
    return {
      kind: "unresolved",
      diagnostic: {
        code: rendererCodes.ambiguous,
        severity: "error",
        stage: "renderer",
        message: `${matches.length} renderers claim "${document.sourcePath}": ${describeIds(matches)}. Register only one renderer per format; choosing between them silently would produce output that is wrong in a way nobody can trace.`,
        sourcePath: document.sourcePath,
      },
    };
  }

  return { kind: "selected", renderer: first };
}

function findDuplicateId(renderers: readonly Renderer[]): string | undefined {
  const seen = new Set<string>();
  for (const renderer of renderers) {
    if (seen.has(renderer.id)) {
      return renderer.id;
    }
    seen.add(renderer.id);
  }
  return undefined;
}

function describeIds(renderers: readonly Renderer[]): string {
  return renderers.length === 0
    ? "none"
    : renderers.map((renderer) => renderer.id).join(", ");
}

/**
 * Renders a document, or returns it unrendered with a diagnostic explaining
 * why.
 *
 * The document is never lost. A selection failure, a thrown renderer, or an
 * invalid tree all leave a `LoadedDocument` carrying an error diagnostic, so
 * the server can serve a page that explains itself rather than nothing at all.
 */
export async function renderDocument(
  renderers: readonly Renderer[],
  document: LoadedDocument,
): Promise<LoadedDocument | RenderedDocument> {
  const selection = selectRenderer(renderers, document);
  if (selection.kind === "unresolved") {
    return withDiagnostics(document, [selection.diagnostic]);
  }

  let result: RenderResult;
  try {
    result = await selection.renderer.render(document);
  } catch (cause) {
    // A renderer wrapping a third-party parser cannot promise never to throw.
    // The message stays readable for whoever sees the page; the original error
    // is carried as `cause` so a stack trace is still reachable while
    // debugging.
    return withDiagnostics(document, [
      {
        code: rendererCodes.threw,
        severity: "error",
        stage: "renderer",
        message: `Renderer "${selection.renderer.id}" failed on "${document.sourcePath}": ${messageOf(cause)}`,
        sourcePath: document.sourcePath,
        cause,
      },
    ]);
  }

  const rendered = withDiagnostics(document, result.diagnostics ?? []);

  // What the renderer found in the source outranks what the loader knew, and
  // it has to be carried: front matter that never reaches the precedence rules
  // is front matter the author wrote for nothing.
  const metadata =
    result.metadata === undefined
      ? rendered.metadata
      : toDocumentMetadata([...rendered.metadata.values, ...result.metadata]);

  return {
    ...rendered,
    stage: "rendered",
    root: result.root,
    metadata,
    ...(result.htmlTitle === undefined ? {} : { htmlTitle: result.htmlTitle }),
    ...(result.scripts === undefined ? {} : { scripts: result.scripts }),
  };
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
