import { describe, expect, it } from "vitest";

import { drawSequence } from "./draw.js";
import { parseDiagram, type SequenceDiagram } from "./parse.js";

/**
 * The figure's own bounds.
 *
 * Everything drawn has to be inside them. A shape outside the viewBox is a
 * shape the reader never sees, and nothing above this layer can notice: the
 * page is valid, the figure is there, and a note has silently gone missing.
 */

function sequence(source: string): SequenceDiagram {
  const result = parseDiagram(source);
  if (!result.ok || result.diagram.kind !== "sequence") {
    throw new Error("expected a sequence diagram");
  }
  return result.diagram;
}

/** Every y a shape reaches, from the drawing's own markup. */
function verticalReach(svg: string): number {
  const values = [
    ...[...svg.matchAll(/<rect[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/gu)].map(
      (match) => Number(match[1]) + Number(match[2]),
    ),
    ...[...svg.matchAll(/<text[^>]*y="([\d.]+)"/gu)].map((match) =>
      Number(match[1]),
    ),
    ...[...svg.matchAll(/[ML](?:[\d.]+) ([\d.]+)/gu)].map((match) =>
      Number(match[1]),
    ),
  ];
  return Math.max(...values);
}

function horizontalReach(svg: string): number {
  const values = [
    ...[...svg.matchAll(/<rect[^>]*x="([\d.]+)"[^>]*width="([\d.]+)"/gu)].map(
      (match) => Number(match[1]) + Number(match[2]),
    ),
    ...[...svg.matchAll(/[ML]([\d.]+) [\d.]+/gu)].map((match) =>
      Number(match[1]),
    ),
  ];
  return Math.max(...values);
}

describe("a sequence diagram's bounds", () => {
  it("contains a note that comes last", () => {
    const drawing = drawSequence(
      sequence(
        "sequenceDiagram\n  A->>B: hello\n  Note over A,B: they agreed\n",
      ),
    );

    expect(verticalReach(drawing.svg)).toBeLessThanOrEqual(drawing.height);
  });

  it("contains a message that comes last", () => {
    const drawing = drawSequence(
      sequence("sequenceDiagram\n  Note over A: first\n  A->>B: hello\n"),
    );

    expect(verticalReach(drawing.svg)).toBeLessThanOrEqual(drawing.height);
  });

  it("contains a self-message on the last participant", () => {
    const drawing = drawSequence(
      sequence("sequenceDiagram\n  A->>B: hello\n  B->>B: thinks it over\n"),
    );

    expect(verticalReach(drawing.svg)).toBeLessThanOrEqual(drawing.height);
    expect(horizontalReach(drawing.svg)).toBeLessThanOrEqual(drawing.width);
  });

  it("contains a note beside the last participant", () => {
    const drawing = drawSequence(
      sequence("sequenceDiagram\n  A->>B: hello\n  Note right of B: waiting\n"),
    );

    expect(horizontalReach(drawing.svg)).toBeLessThanOrEqual(drawing.width);
  });

  it("draws the same bytes twice", () => {
    const source = "sequenceDiagram\n  A->>B: one\n  B-->>A: two\n";
    expect(drawSequence(sequence(source))).toEqual(
      drawSequence(sequence(source)),
    );
  });
});
