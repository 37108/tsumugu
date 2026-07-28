import type { DocumentNode } from "../ast/nodes.js";
import type { DocumentDiagnostic } from "../document/diagnostics.js";
import type { SourcePath } from "../document/paths.js";

/**
 * The transformer contract: Semantic AST in, Semantic AST out.
 *
 * Heading identifiers, syntax-highlighting annotations, link normalization —
 * each is a change to what a document *means* that no renderer should have to
 * know about and no theme should have to invent. Putting them in a renderer
 * would make every format implement them separately; putting them in a theme
 * would mean swapping the presentation silently changed the anchors people had
 * already linked to.
 *
 * So there is one stage between the two, and it is deliberately not a plugin
 * system. A transformer is an id and a function. There are no lifecycle hooks,
 * no access to the scanner, the router or the response, and no way to observe
 * another transformer: the only thing a transformer can do is return a
 * different tree. That is what makes an ordered list of them possible to
 * reason about, and what stops "transform" becoming "run arbitrary code inside
 * the pipeline".
 *
 * **Order is registration order**, and it is the caller's. Two transformers
 * that disagree about a node resolve it by the order the composition root
 * chose, visibly, rather than by a priority number nobody can see.
 *
 * **Transformers return new trees.** The AST is `readonly` throughout, so
 * mutating an input is a type error rather than a convention; a transformer
 * that rewrites one heading returns the document with that heading replaced and
 * shares everything it did not touch. Mutation would make the previous stage's
 * output depend on who ran after it, which is precisely what makes caching
 * unsafe.
 */

/** What a transformer is told about the document it is given. */
export interface TransformContext {
  readonly sourcePath: SourcePath;
  /** Reports a problem without failing the document. */
  readonly report: (diagnostic: DocumentDiagnostic) => void;
}

export interface Transformer {
  /** Stable identity, used to name the responsible transformer in diagnostics. */
  readonly id: string;
  /**
   * Returns the transformed document.
   *
   * May be asynchronous: a highlighter loading a grammar has to be, and a
   * contract that forbade it would push that work into a renderer instead.
   */
  readonly transform: (
    root: DocumentNode,
    context: TransformContext,
  ) => DocumentNode | Promise<DocumentNode>;
}

export const transformerCodes = {
  duplicateId: "transformer/duplicate-id",
  threw: "transformer/threw",
  invalidResult: "transformer/invalid-result",
} as const;

export interface TransformResult {
  readonly root: DocumentNode;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

/**
 * Runs transformers in registration order.
 *
 * A failing transformer costs its own contribution and nothing else: the
 * document carries on to the next one as it was before the failure, and the
 * diagnostic names which transformer broke. One awkward code block should not
 * cost a reader the page it was on.
 *
 * Zero transformers is not a special case — the document comes back unchanged,
 * which is what lets a project compose none without the pipeline branching.
 */
export async function runTransformers(
  transformers: readonly Transformer[],
  root: DocumentNode,
  context: Omit<TransformContext, "report">,
): Promise<TransformResult> {
  const diagnostics: DocumentDiagnostic[] = [];
  const seen = new Set<string>();
  let current = root;

  for (const transformer of transformers) {
    if (seen.has(transformer.id)) {
      // Two transformers with one id make every diagnostic ambiguous about
      // which of them produced it.
      diagnostics.push({
        code: transformerCodes.duplicateId,
        severity: "error",
        stage: "transformer",
        message: `More than one transformer is registered as "${transformer.id}".`,
        hint: "Give each transformer a distinct id; only the first was run.",
        sourcePath: context.sourcePath,
      });
      continue;
    }
    seen.add(transformer.id);

    try {
      const produced = await transformer.transform(current, {
        ...context,
        report: (diagnostic) => diagnostics.push(diagnostic),
      });

      const producedType: string = produced.type;
      if (producedType !== "document") {
        // A transformer that returns a node other than the root would leave
        // the pipeline holding something no stage after it can render.
        diagnostics.push({
          code: transformerCodes.invalidResult,
          severity: "error",
          stage: "transformer",
          message: `Transformer "${transformer.id}" returned a "${producedType}" node instead of a document.`,
          hint: "The document is unchanged by this transformer.",
          sourcePath: context.sourcePath,
        });
        continue;
      }

      current = produced;
    } catch (cause) {
      diagnostics.push({
        code: transformerCodes.threw,
        severity: "error",
        stage: "transformer",
        message: `Transformer "${transformer.id}" failed: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        hint: "The document is unchanged by this transformer; everything else still ran.",
        sourcePath: context.sourcePath,
        cause,
      });
    }
  }

  return { root: current, diagnostics };
}
