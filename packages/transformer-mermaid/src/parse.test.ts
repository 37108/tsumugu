import { describe, expect, it } from "vitest";

import { parseDiagram } from "./parse.js";

/**
 * What the subset is, stated as tests.
 *
 * These are below the observable line on purpose: what a reader sees is a
 * figure, tested where the page is built. What is tested here is the boundary of
 * the subset — which constructs are read, and that everything else is refused
 * with a position an author can act on, because that boundary is the whole of
 * ADR 9's negative half.
 */

function flowchart(source: string) {
  const result = parseDiagram(source);
  if (!result.ok) {
    throw new Error(`expected a diagram, got: ${result.reason}`);
  }
  return result.diagram;
}

describe("a flowchart", () => {
  it("reads a direction, and defaults to top down", () => {
    expect(flowchart("graph LR\n  A --> B\n").direction).toBe("LR");
    expect(flowchart("flowchart BT\n  A --> B\n").direction).toBe("BT");
    expect(flowchart("graph\n  A --> B\n").direction).toBe("TD");
  });

  it("takes a node's label from its declaration, wherever it appears", () => {
    const diagram = flowchart("graph LR\n  A[Scanner] --> B\n  B[Renderer]\n");

    expect(diagram.nodes).toEqual([
      { id: "A", label: "Scanner", shape: "rectangle" },
      { id: "B", label: "Renderer", shape: "rectangle" },
    ]);
  });

  it("labels a node with its own identifier when nothing named it", () => {
    expect(flowchart("graph LR\n  A --> B\n").nodes[0]?.label).toBe("A");
  });

  it("reads every shape in the subset", () => {
    const diagram = flowchart(
      "graph TD\n  A[Rect] --> B(Round)\n  B --> C{Choice}\n  C --> D((Circle))\n",
    );

    expect(diagram.nodes.map((node) => node.shape)).toEqual([
      "rectangle",
      "rounded",
      "diamond",
      "circle",
    ]);
  });

  it("reads every edge in the subset, with and without arrowheads", () => {
    const diagram = flowchart(
      "graph TD\n  A --> B\n  B --- C\n  C -.-> D\n  D ==> E\n",
    );

    expect(
      diagram.edges.map((edge) => `${edge.stroke}${edge.arrow ? "!" : ""}`),
    ).toEqual(["solid!", "solid", "dashed!", "thick!"]);
  });

  it("reads a chain as one statement", () => {
    const diagram = flowchart("graph LR\n  A --> B --> C\n");

    expect(diagram.edges).toEqual([
      { from: "A", to: "B", stroke: "solid", arrow: true },
      { from: "B", to: "C", stroke: "solid", arrow: true },
    ]);
  });

  it("reads an edge label", () => {
    const diagram = flowchart("graph TD\n  A -->|yes| B\n  A -->|no| C\n");

    expect(diagram.edges.map((edge) => edge.label)).toEqual(["yes", "no"]);
  });

  it("reads several statements separated by semicolons", () => {
    expect(flowchart("graph LR\n  A --> B; B --> C;\n").edges.length).toBe(2);
  });

  it("ignores comments and blank lines", () => {
    const diagram = flowchart("graph LR\n\n  %% a note\n  A --> B\n\n");

    expect(diagram.edges.length).toBe(1);
  });

  it("takes the author's accessible name and description", () => {
    const diagram = flowchart(
      "graph LR\n  accTitle: Pipeline stages\n  accDescr: Scanner feeds the renderer.\n  A --> B\n",
    );

    expect(diagram.accessibleTitle).toBe("Pipeline stages");
    expect(diagram.accessibleDescription).toBe("Scanner feeds the renderer.");
  });

  it("keeps a quoted label's spaces and punctuation", () => {
    expect(
      flowchart('graph LR\n  A["Read, then write"] --> B\n').nodes[0]?.label,
    ).toBe("Read, then write");
  });
});

describe("what it refuses", () => {
  it("names the diagram kind it will not draw, with a line", () => {
    const result = parseDiagram("stateDiagram-v2\n  [*] --> Idle\n");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain("a state diagram");
    expect(result.position.line).toBe(1);
  });

  it("refuses a kind it has never heard of rather than guessing", () => {
    const result = parseDiagram("interpretiveDance\n  A --> B\n");

    expect(result.ok).toBe(false);
  });

  it("refuses a direction outside the subset and says which are supported", () => {
    const result = parseDiagram("graph SIDEWAYS\n  A --> B\n");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain("TD");
  });

  it("refuses an unterminated edge label, at the line it is on", () => {
    const result = parseDiagram("graph LR\n  A --> B\n  B -->|oops C\n");

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.position.line).toBe(3);
  });

  it("refuses an empty diagram", () => {
    expect(parseDiagram("\n\n").ok).toBe(false);
  });
});
