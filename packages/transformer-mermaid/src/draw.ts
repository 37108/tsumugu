import { lineHeight, textWidth } from "./metrics.js";
import type {
  Direction,
  Flowchart,
  FlowchartNode,
  NodeShape,
} from "./parse.js";

/**
 * Layout and drawing.
 *
 * The layout is layered: every node gets a rank from how far it is from a
 * starting node, ranks become rows (or columns, following the direction), and
 * boxes are centred within their rank. That is the smallest thing that reads
 * correctly for the shape documentation actually contains — a pipeline, a
 * decision, a fan-out — and it is entirely arithmetic, so the same source draws
 * the same bytes on every machine.
 *
 * Nothing here is a general graph-drawing engine. A crossing-minimising pass, a
 * spline router and orthogonal edges are what a real layout library does, and
 * every one of them is a decision this project has not needed yet.
 */

const fontSize = 13;
const labelFontSize = 12;
/** Space inside a box, around its label. */
const paddingX = 14;
const paddingY = 9;
/** Space between ranks, and between boxes within a rank. */
const rankGap = 46;
const nodeGap = 26;
/** Room around the whole figure, so a box's edge is not the figure's edge. */
const margin = 8;
const arrowLength = 9;
const arrowWidth = 3.4;

interface Box {
  readonly node: FlowchartNode;
  readonly width: number;
  readonly height: number;
  x: number;
  y: number;
}

/** Escapes text for an SVG text node. The drawing is markup; labels are not. */
function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sizeOf(node: FlowchartNode): { width: number; height: number } {
  const text = textWidth(node.label, fontSize);
  const height = lineHeight(fontSize) + paddingY * 2;

  if (node.shape === "circle") {
    // A circle has to contain the label on the diagonal, not the width.
    const diameter = Math.max(text * 1.35, height * 1.6);
    return { width: round(diameter), height: round(diameter) };
  }
  if (node.shape === "diamond") {
    // A diamond's usable width at the label's height is half its own, so it
    // has to be twice as wide as the text to hold it.
    return { width: round(text * 1.9 + paddingX), height: round(height * 1.7) };
  }
  return { width: round(text + paddingX * 2), height: round(height) };
}

/**
 * How far each node sits from a starting node.
 *
 * Longest path, so a node with two incoming edges of different lengths sits
 * below both of its sources rather than beside the nearer one. Cycles are
 * bounded by refusing to re-rank a node already on the current walk — a cyclic
 * flowchart is drawn rather than hung.
 */
function ranksOf(diagram: Flowchart): Map<string, number> {
  const ranks = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const hasIncoming = new Set<string>();

  for (const edge of diagram.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    hasIncoming.add(edge.to);
  }

  const walk = (id: string, rank: number, seen: readonly string[]): void => {
    if (seen.includes(id)) {
      return;
    }
    if ((ranks.get(id) ?? -1) >= rank) {
      return;
    }
    ranks.set(id, rank);
    for (const next of outgoing.get(id) ?? []) {
      walk(next, rank + 1, [...seen, id]);
    }
  };

  // Sources first, then anything a cycle left unranked, in declaration order so
  // the result does not depend on Map iteration luck.
  for (const node of diagram.nodes) {
    if (!hasIncoming.has(node.id)) {
      walk(node.id, 0, []);
    }
  }
  for (const node of diagram.nodes) {
    if (!ranks.has(node.id)) {
      walk(node.id, 0, []);
    }
  }

  return ranks;
}

/** True when the direction lays ranks out left to right rather than top down. */
function isHorizontal(direction: Direction): boolean {
  return direction === "LR" || direction === "RL";
}

interface Drawing {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

function shapeMarkup(box: Box): string {
  const { x, y, width, height } = box;
  const shape: NodeShape = box.node.shape;

  if (shape === "circle") {
    return `<ellipse cx="${round(x + width / 2)}" cy="${round(y + height / 2)}" rx="${round(width / 2)}" ry="${round(height / 2)}"/>`;
  }
  if (shape === "diamond") {
    const points = [
      [x + width / 2, y],
      [x + width, y + height / 2],
      [x + width / 2, y + height],
      [x, y + height / 2],
    ]
      .map(([pointX, pointY]) => `${round(pointX ?? 0)},${round(pointY ?? 0)}`)
      .join(" ");
    return `<polygon points="${points}"/>`;
  }
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}"${shape === "rounded" ? ' rx="10" ry="10"' : ""}/>`;
}

/** Where a line leaving `from` towards `to` crosses `from`'s boundary. */
function exitPoint(from: Box, to: Box): { x: number; y: number } {
  const fromX = from.x + from.width / 2;
  const fromY = from.y + from.height / 2;
  const toX = to.x + to.width / 2;
  const toY = to.y + to.height / 2;
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;

  if (deltaX === 0 && deltaY === 0) {
    return { x: fromX, y: fromY };
  }

  // Scale the direction until it reaches the box's edge: whichever axis reaches
  // its half-extent first is the side the line leaves by.
  const scaleX = deltaX === 0 ? Infinity : from.width / 2 / Math.abs(deltaX);
  const scaleY = deltaY === 0 ? Infinity : from.height / 2 / Math.abs(deltaY);
  const scale = Math.min(scaleX, scaleY);

  return { x: fromX + deltaX * scale, y: fromY + deltaY * scale };
}

function arrowMarkup(
  tip: { readonly x: number; readonly y: number },
  towards: { readonly x: number; readonly y: number },
): string {
  const deltaX = tip.x - towards.x;
  const deltaY = tip.y - towards.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const baseX = tip.x - unitX * arrowLength;
  const baseY = tip.y - unitY * arrowLength;

  const points = [
    [tip.x, tip.y],
    [baseX - unitY * arrowWidth, baseY + unitX * arrowWidth],
    [baseX + unitY * arrowWidth, baseY - unitX * arrowWidth],
  ]
    .map(([x, y]) => `${round(x ?? 0)},${round(y ?? 0)}`)
    .join(" ");

  return `<polygon class="tsumugu-diagram-arrow" points="${points}"/>`;
}

/**
 * Draws a flowchart.
 *
 * Returns the figure's contents and its own coordinate space. The `svg` element
 * itself, and every colour, belong to the theme.
 */
export function drawFlowchart(diagram: Flowchart): Drawing {
  const ranks = ranksOf(diagram);
  const boxes = new Map<string, Box>();
  const byRank = new Map<number, Box[]>();

  for (const node of diagram.nodes) {
    const size = sizeOf(node);
    const box: Box = { node, ...size, x: 0, y: 0 };
    boxes.set(node.id, box);
    const rank = ranks.get(node.id) ?? 0;
    byRank.set(rank, [...(byRank.get(rank) ?? []), box]);
  }

  const horizontal = isHorizontal(diagram.direction);
  const rankNumbers = [...byRank.keys()].sort((left, right) => left - right);

  // Along the rank axis: each rank starts after the deepest box in the one
  // before it. Across it: boxes are centred against the widest rank.
  const rankExtent = new Map<number, number>();
  const crossExtent = new Map<number, number>();
  for (const rank of rankNumbers) {
    const inRank = byRank.get(rank) ?? [];
    rankExtent.set(
      rank,
      Math.max(...inRank.map((box) => (horizontal ? box.width : box.height))),
    );
    crossExtent.set(
      rank,
      inRank.reduce(
        (total, box) => total + (horizontal ? box.height : box.width),
        nodeGap * (inRank.length - 1),
      ),
    );
  }

  const widestCross = Math.max(...crossExtent.values());
  let along = margin;

  for (const rank of rankNumbers) {
    const inRank = byRank.get(rank) ?? [];
    let across = margin + (widestCross - (crossExtent.get(rank) ?? 0)) / 2;

    for (const box of inRank) {
      if (horizontal) {
        box.x = round(along + ((rankExtent.get(rank) ?? 0) - box.width) / 2);
        box.y = round(across);
        across += box.height + nodeGap;
      } else {
        box.x = round(across);
        box.y = round(along + ((rankExtent.get(rank) ?? 0) - box.height) / 2);
        across += box.width + nodeGap;
      }
    }

    along += (rankExtent.get(rank) ?? 0) + rankGap;
  }

  const width = round(
    (horizontal ? along - rankGap : widestCross + margin * 2) + margin,
  );
  const height = round(
    (horizontal ? widestCross + margin * 2 : along - rankGap) + margin,
  );

  // Reversed directions are the same layout, mirrored: laying it out once and
  // flipping the coordinates keeps one implementation for four directions.
  if (diagram.direction === "RL" || diagram.direction === "BT") {
    for (const box of boxes.values()) {
      if (horizontal) {
        box.x = round(width - box.x - box.width);
      } else {
        box.y = round(height - box.y - box.height);
      }
    }
  }

  const parts: string[] = [];

  for (const edge of diagram.edges) {
    const from = boxes.get(edge.from);
    const to = boxes.get(edge.to);
    if (from === undefined || to === undefined) {
      continue;
    }

    const start = exitPoint(from, to);
    const end = exitPoint(to, from);
    const tip = edge.arrow ? end : end;
    const classes = [
      "tsumugu-diagram-edge",
      edge.stroke === "dashed" ? "tsumugu-diagram-edge-dashed" : "",
      edge.stroke === "thick" ? "tsumugu-diagram-edge-thick" : "",
    ]
      .filter((name) => name !== "")
      .join(" ");

    // The line stops short of the arrowhead so the two do not overlap into a
    // blob at the tip.
    const shortenBy = edge.arrow ? arrowLength - 1 : 0;
    const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const lineEndX = end.x - ((end.x - start.x) / length) * shortenBy;
    const lineEndY = end.y - ((end.y - start.y) / length) * shortenBy;

    parts.push(
      `<path class="${classes}" d="M${round(start.x)} ${round(start.y)} L${round(lineEndX)} ${round(lineEndY)}"/>`,
    );
    if (edge.arrow) {
      parts.push(arrowMarkup(tip, start));
    }

    if (edge.label !== undefined && edge.label !== "") {
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const labelWidth = textWidth(edge.label, labelFontSize);
      const labelHeight = lineHeight(labelFontSize);
      parts.push(
        `<rect class="tsumugu-diagram-label-backdrop" x="${round(midX - labelWidth / 2 - 3)}" y="${round(midY - labelHeight / 2)}" width="${round(labelWidth + 6)}" height="${round(labelHeight)}"/>`,
        `<text class="tsumugu-diagram-label" x="${round(midX)}" y="${round(midY + labelFontSize * 0.36)}" text-anchor="middle">${escape(edge.label)}</text>`,
      );
    }
  }

  for (const node of diagram.nodes) {
    const box = boxes.get(node.id);
    if (box === undefined) {
      continue;
    }
    parts.push(
      `<g class="tsumugu-diagram-node">${shapeMarkup(box)}<text x="${round(box.x + box.width / 2)}" y="${round(box.y + box.height / 2 + fontSize * 0.36)}" text-anchor="middle">${escape(node.label)}</text></g>`,
    );
  }

  return { svg: parts.join(""), width, height };
}

/** Direction, in words, for a description a screen reader will read out. */
const directionWords: Readonly<Record<Direction, string>> = {
  TD: "top to bottom",
  TB: "top to bottom",
  LR: "left to right",
  RL: "right to left",
  BT: "bottom to top",
};

/**
 * What the figure shows, in a sentence, for a reader who cannot see it.
 *
 * Used when the author wrote no `accDescr`. It describes the edges rather than
 * listing the boxes, because the edges are what a flowchart is *for* — a list of
 * five names tells a screen-reader user nothing about what leads to what.
 */
export function describeFlowchart(diagram: Flowchart): string {
  const labels = new Map(diagram.nodes.map((node) => [node.id, node.label]));
  const named = (id: string): string => labels.get(id) ?? id;

  if (diagram.edges.length === 0) {
    const only = diagram.nodes.map((node) => node.label).join(", ");
    return diagram.nodes.length === 0
      ? "An empty flowchart."
      : `A flowchart of ${only}, with nothing connecting them.`;
  }

  const steps = diagram.edges.map((edge) => {
    const link =
      edge.label === undefined || edge.label === ""
        ? "leads to"
        : `leads, ${edge.label}, to`;
    return `${named(edge.from)} ${link} ${named(edge.to)}`;
  });

  return `A flowchart, ${directionWords[diagram.direction]}: ${steps.join("; ")}.`;
}
