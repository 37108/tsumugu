/**
 * The Mermaid subset Tsumugu understands, and the refusal for everything else.
 *
 * Parsing stops at the first construct outside the subset and says which line it
 * was on. That is deliberate: a diagram half-drawn is worse than a diagram left
 * as code, because a reader cannot tell which half is missing. The caller turns
 * a refusal into a warning and leaves the author's block exactly as they wrote
 * it (ADR 9).
 */

/** Where in the diagram source something was found. 1-based, like a parser. */
export interface SourcePosition {
  readonly line: number;
  readonly column: number;
}

export type NodeShape = "rectangle" | "rounded" | "diamond" | "circle";

export interface FlowchartNode {
  readonly id: string;
  readonly label: string;
  readonly shape: NodeShape;
}

export type EdgeStroke = "solid" | "dashed" | "thick";

export interface FlowchartEdge {
  readonly from: string;
  readonly to: string;
  readonly stroke: EdgeStroke;
  readonly arrow: boolean;
  readonly label?: string;
}

/** Flowchart direction, as Mermaid spells it. */
export type Direction = "TD" | "TB" | "LR" | "RL" | "BT";

export interface Flowchart {
  readonly kind: "flowchart";
  readonly direction: Direction;
  readonly nodes: readonly FlowchartNode[];
  readonly edges: readonly FlowchartEdge[];
  /** The author's `accTitle`, when they wrote one. */
  readonly accessibleTitle?: string;
  /** The author's `accDescr`, when they wrote one. */
  readonly accessibleDescription?: string;
}

export type Diagram = Flowchart;

export interface ParseRefusal {
  readonly ok: false;
  /** What could not be drawn, phrased for an author reading a warning. */
  readonly reason: string;
  readonly position: SourcePosition;
}

export type ParseResult =
  { readonly ok: true; readonly diagram: Diagram } | ParseRefusal;

/** Diagram kinds Mermaid has and Tsumugu does not draw, named for the warning. */
const knownOtherKinds = new Map<string, string>([
  ["classdiagram", "a class diagram"],
  ["statediagram", "a state diagram"],
  ["statediagram-v2", "a state diagram"],
  ["erdiagram", "an entity relationship diagram"],
  ["journey", "a user journey"],
  ["gantt", "a Gantt chart"],
  ["pie", "a pie chart"],
  ["quadrantchart", "a quadrant chart"],
  ["requirementdiagram", "a requirement diagram"],
  ["gitgraph", "a Git graph"],
  ["mindmap", "a mind map"],
  ["timeline", "a timeline"],
  ["zenuml", "a ZenUML diagram"],
  ["sankey-beta", "a Sankey diagram"],
  ["xychart-beta", "an XY chart"],
  ["block-beta", "a block diagram"],
  ["packet-beta", "a packet diagram"],
  ["kanban", "a Kanban board"],
  ["architecture-beta", "an architecture diagram"],
  ["radar-beta", "a radar chart"],
  ["treemap-beta", "a treemap"],
  ["c4context", "a C4 diagram"],
]);

const directions = new Set<Direction>(["TD", "TB", "LR", "RL", "BT"]);

/** A line, with the position it started at, comments and blanks removed. */
interface Line {
  readonly text: string;
  readonly line: number;
}

function meaningfulLines(source: string): Line[] {
  return source
    .split("\n")
    .map((text, index) => ({ text: text.trim(), line: index + 1 }))
    .filter((line) => line.text !== "" && !line.text.startsWith("%%"));
}

/**
 * The shape and label a node declaration carries, if it declares one.
 *
 * `A[Do the thing]` declares a rectangle; a bare `A` refers to whatever was
 * declared elsewhere, or to itself when nothing was.
 */
const nodePattern =
  /^(?<id>[\w.-]+)(?:(?<open>\(\(|\[|\(|\{)(?<label>[^\]})]*)(?:\)\)|\]|\)|\}))?$/u;

const shapesByOpener = new Map<string, NodeShape>([
  ["[", "rectangle"],
  ["(", "rounded"],
  ["((", "circle"],
  ["{", "diamond"],
]);

/** Edge operators, longest first so `-.->` is not read as `-` then `.`. */
const edgeOperators: readonly {
  readonly operator: string;
  readonly stroke: EdgeStroke;
  readonly arrow: boolean;
}[] = [
  { operator: "-.->", stroke: "dashed", arrow: true },
  { operator: "-.-", stroke: "dashed", arrow: false },
  { operator: "==>", stroke: "thick", arrow: true },
  { operator: "===", stroke: "thick", arrow: false },
  { operator: "-->", stroke: "solid", arrow: true },
  { operator: "---", stroke: "solid", arrow: false },
];

interface Statement {
  readonly nodes: readonly FlowchartNode[];
  readonly edges: readonly FlowchartEdge[];
}

function unquote(label: string): string {
  const trimmed = label.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1
    ? trimmed.slice(1, -1)
    : trimmed;
}

function parseNodeReference(
  text: string,
  line: number,
): { readonly node: FlowchartNode } | ParseRefusal {
  const match = nodePattern.exec(text.trim());
  const id = match?.groups?.["id"];

  if (match === null || id === undefined) {
    return {
      ok: false,
      reason: `"${text.trim()}" is not a node Tsumugu can read`,
      position: { line, column: 1 },
    };
  }

  const opener = match.groups?.["open"];
  const label = match.groups?.["label"];

  return {
    node: {
      id,
      label: label === undefined ? id : unquote(label),
      shape:
        opener === undefined
          ? "rectangle"
          : (shapesByOpener.get(opener) ?? "rectangle"),
    },
  };
}

/** One link in a chain: the operator that was written, and its label. */
interface Connector {
  readonly stroke: EdgeStroke;
  readonly arrow: boolean;
  readonly label?: string;
}

/**
 * One statement: a chain of nodes joined by edges, or a lone node.
 *
 * `A --> B --> C` is one statement declaring three nodes and two edges, which is
 * how Mermaid reads it and how authors write it.
 */
function parseStatement(text: string, line: number): Statement | ParseRefusal {
  // Split the statement into the nodes it names and the connectors between
  // them, then pair them up. Scanning once and pairing afterwards is what keeps
  // a chain — `A --> B --> C` — from needing a second parse of every target.
  const references: string[] = [];
  const connectors: Connector[] = [];

  let rest = text;

  for (;;) {
    const found = edgeOperators
      .map((candidate) => ({
        ...candidate,
        index: rest.indexOf(candidate.operator),
      }))
      .filter((candidate) => candidate.index !== -1)
      .sort((left, right) => left.index - right.index)[0];

    if (found === undefined) {
      references.push(rest);
      break;
    }

    references.push(rest.slice(0, found.index));
    let after = rest.slice(found.index + found.operator.length);
    let label: string | undefined;

    if (after.startsWith("|")) {
      const end = after.indexOf("|", 1);
      if (end === -1) {
        return {
          ok: false,
          reason: "an edge label is missing its closing |",
          position: { line, column: 1 },
        };
      }
      label = unquote(after.slice(1, end));
      after = after.slice(end + 1);
    }

    connectors.push({
      stroke: found.stroke,
      arrow: found.arrow,
      ...(label === undefined ? {} : { label }),
    });
    rest = after;
  }

  const nodes: FlowchartNode[] = [];
  for (const reference of references) {
    const parsed = parseNodeReference(reference, line);
    if ("ok" in parsed) {
      return parsed;
    }
    nodes.push(parsed.node);
  }

  const edges: FlowchartEdge[] = connectors.map((connector, index) => ({
    from: nodes[index]?.id ?? "",
    to: nodes[index + 1]?.id ?? "",
    stroke: connector.stroke,
    arrow: connector.arrow,
    ...(connector.label === undefined ? {} : { label: connector.label }),
  }));

  return { nodes, edges };
}

/**
 * Reads a diagram, or refuses it.
 *
 * @param source The contents of a fenced `mermaid` block, exactly as written.
 */
export function parseDiagram(source: string): ParseResult {
  const lines = meaningfulLines(source);
  const first = lines[0];

  if (first === undefined) {
    return {
      ok: false,
      reason: "the diagram is empty",
      position: { line: 1, column: 1 },
    };
  }

  const header = /^(?<kind>[\w-]+)\s*(?<rest>.*)$/u.exec(first.text);
  const kind = header?.groups?.["kind"]?.toLowerCase();

  if (kind === undefined) {
    return {
      ok: false,
      reason: `"${first.text}" does not name a diagram kind`,
      position: { line: first.line, column: 1 },
    };
  }

  if (kind !== "graph" && kind !== "flowchart") {
    const named = knownOtherKinds.get(kind);
    return {
      ok: false,
      reason:
        named === undefined
          ? `"${first.text}" is not a diagram kind Tsumugu draws`
          : `${named} is not a diagram kind Tsumugu draws`,
      position: { line: first.line, column: 1 },
    };
  }

  const stated = (header?.groups?.["rest"] ?? "").trim().toUpperCase();
  if (stated !== "" && !directions.has(stated as Direction)) {
    return {
      ok: false,
      reason: `"${stated}" is not a direction Tsumugu draws — use TD, TB, LR, RL or BT`,
      position: { line: first.line, column: 1 },
    };
  }
  const direction: Direction = stated === "" ? "TD" : (stated as Direction);

  const byId = new Map<string, FlowchartNode>();
  const edges: FlowchartEdge[] = [];
  let accessibleTitle: string | undefined;
  let accessibleDescription: string | undefined;

  for (const line of lines.slice(1)) {
    const accessible = /^acc(?<which>Title|Descr)\s*:\s*(?<value>.*)$/u.exec(
      line.text,
    );
    if (accessible !== null) {
      const value = (accessible.groups?.["value"] ?? "").trim();
      if (accessible.groups?.["which"] === "Title") {
        accessibleTitle = value;
      } else {
        accessibleDescription = value;
      }
      continue;
    }

    // `;` ends a statement, and Mermaid allows several on one line.
    for (const part of line.text.split(";")) {
      const statement = part.trim();
      if (statement === "") {
        continue;
      }

      const parsed = parseStatement(statement, line.line);
      if ("ok" in parsed) {
        return parsed;
      }

      for (const node of parsed.nodes) {
        const existing = byId.get(node.id);
        // A later declaration with a label wins over a bare reference, so
        // `A --> B` followed by `B[Renderer]` names the box.
        if (existing === undefined || node.label !== node.id) {
          byId.set(node.id, node);
        }
      }
      edges.push(...parsed.edges);
    }
  }

  return {
    ok: true,
    diagram: {
      kind: "flowchart",
      direction,
      nodes: [...byId.values()],
      edges,
      ...(accessibleTitle === undefined ? {} : { accessibleTitle }),
      ...(accessibleDescription === undefined ? {} : { accessibleDescription }),
    },
  };
}
