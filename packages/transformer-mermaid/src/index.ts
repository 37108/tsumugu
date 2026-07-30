import type {
  BlockNode,
  DiagramNode,
  DocumentNode,
  SemanticNode,
  TransformContext,
  Transformer,
} from "tsumugu-core";

import {
  describeFlowchart,
  describeSequence,
  drawFlowchart,
  drawSequence,
} from "./draw.js";
import { parseDiagram } from "./parse.js";

/**
 * Diagrams, drawn at build time, by Tsumugu.
 *
 * A fenced block tagged `mermaid` becomes a figure. The reader receives an SVG
 * and no script; the author keeps a diagram that is readable as text and
 * versioned with the prose beside it.
 *
 * ## Why this draws rather than delegating
 *
 * Mermaid's own renderer needs a DOM. Measured against Mermaid 11.16 under
 * jsdom, sequence diagrams came out correctly and flowcharts did not: labels
 * land in a `foreignObject`, which no browser renders inside an image, and the
 * layout asks the DOM to measure text, producing a 41216px width for a
 * five-node graph. A headless browser fixes both and costs a browser download
 * per install. ADR 9 has the measurements and the decision.
 *
 * So Tsumugu draws a documented subset itself, with no dependency, and refuses
 * the rest out loud. What that buys, beyond the weight: output is deterministic,
 * which incremental rebuilds require; the figure inherits the page's colours,
 * because it carries geometry and class names rather than baked-in styling; and
 * its text stays selectable and searchable.
 *
 * ## What it does not do
 *
 * It is not Mermaid. Diagram kinds outside the subset, `%%{init}%%` directives,
 * subgraphs, `classDef` and `style` statements, and click handlers are all
 * refused, and a refusal leaves the author's code block exactly as it was with a
 * warning naming what was not drawn. A diagram Tsumugu cannot draw must never
 * cost a reader the page.
 */

export const mermaidTransformerId = "tsumugu:mermaid";

export const mermaidCodes = {
  /** The diagram is outside the subset. The block is left as code. */
  notDrawn: "transformer-mermaid/not-drawn",
} as const;

export interface MermaidOptions {
  /**
   * Fence languages treated as diagrams.
   *
   * `mermaid` by default. A project whose authors write ` ```mmd ` adds it here
   * rather than renaming every block.
   */
  readonly languages?: readonly string[];
}

const defaultLanguages = ["mermaid"];

/** A title for a figure whose author wrote no `accTitle`. */
const generatedTitle = "Flowchart";

function isDiagramFence(
  node: SemanticNode,
  languages: readonly string[],
): boolean {
  return (
    node.type === "code-block" &&
    node.language !== undefined &&
    languages.includes(node.language.trim().toLowerCase())
  );
}

/**
 * Draws every diagram in a document, numbering the figures as it goes.
 *
 * The number is why this walks with a counter: two figures on one page each need
 * an identity of their own, and only something that sees the whole document can
 * assign one.
 */
export function createMermaidTransformer(
  options: MermaidOptions = {},
): Transformer {
  const languages = (options.languages ?? defaultLanguages).map((language) =>
    language.trim().toLowerCase(),
  );

  return {
    id: mermaidTransformerId,

    transform: (
      root: DocumentNode,
      context: TransformContext,
    ): DocumentNode => {
      let drawn = 0;

      const replace = <T extends SemanticNode>(node: T): T => {
        if (isDiagramFence(node, languages) && node.type === "code-block") {
          const parsed = parseDiagram(node.value);

          if (!parsed.ok) {
            // The author's block stays exactly as they wrote it. The warning
            // names the construct and points at the line inside the diagram,
            // offset by where the block itself starts.
            const blockLine = node.range?.start.line ?? 1;
            context.report({
              code: mermaidCodes.notDrawn,
              severity: "warning",
              stage: "transformer",
              message: `Not drawn: ${parsed.reason}.`,
              hint: "The diagram is shown as code instead. Tsumugu draws flowcharts (graph/flowchart with TD, TB, LR, RL or BT) and sequence diagrams.",
              sourcePath: context.sourcePath,
              range: {
                start: {
                  line: blockLine + parsed.position.line,
                  column: parsed.position.column,
                  offset: node.range?.start.offset ?? 0,
                },
                end: {
                  line: blockLine + parsed.position.line,
                  column: parsed.position.column,
                  offset: node.range?.end.offset ?? 0,
                },
              },
            });
            return node;
          }

          drawn += 1;
          const drawing =
            parsed.diagram.kind === "sequence"
              ? drawSequence(parsed.diagram)
              : drawFlowchart(parsed.diagram);
          const diagram: DiagramNode = {
            type: "diagram",
            dialect: "mermaid",
            id: String(drawn),
            svg: drawing.svg,
            width: drawing.width,
            height: drawing.height,
            title:
              parsed.diagram.accessibleTitle ??
              (parsed.diagram.kind === "sequence"
                ? "Sequence diagram"
                : generatedTitle),
            description:
              parsed.diagram.accessibleDescription ??
              (parsed.diagram.kind === "sequence"
                ? describeSequence(parsed.diagram)
                : describeFlowchart(parsed.diagram)),
            source: node.value,
            ...(node.range === undefined ? {} : { range: node.range }),
          };
          return diagram as SemanticNode as T;
        }

        if (!("children" in node)) {
          return node;
        }

        const children = (node.children as readonly SemanticNode[]).map(
          (child) => replace(child),
        );
        const changed = children.some(
          (child, index) => child !== node.children[index],
        );
        return changed ? { ...node, children: children as BlockNode[] } : node;
      };

      return replace(root);
    },
  };
}
