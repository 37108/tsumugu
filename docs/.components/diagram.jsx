/**
 * Figures for the architecture pages.
 *
 * These run while the page is built, under `--trust`, and what reaches a
 * reader is static SVG: no client-side JavaScript, no framework runtime, no
 * request to anywhere. The point of computing them rather than drawing them is
 * that each figure is derived from the same list a reader could check against
 * the prose — a stage cannot silently disappear from the picture while staying
 * in the text.
 *
 * The directory is dotted on purpose. Tsumugu refuses dotfiles, so these are
 * build inputs and never published beside the documents they draw.
 *
 * Colours come from the theme's own custom properties, so a figure follows the
 * reader into dark mode without a second palette. Every fallback is the light
 * value, for the case where the page is read outside the theme. Connectors use
 * the muted ink rather than the rule colour: a line that carries meaning has to
 * clear the same contrast bar as a control, and the rule colour is for edges
 * that only separate.
 */

const ink = "var(--ts-ink, #1a1c22)";
const muted = "var(--ts-ink-muted, #5a5f6b)";
const paper = "var(--ts-paper, #fcfbf8)";
const panel = "var(--ts-panel, #f7f5ef)";
const accent = "var(--ts-indigo, #274177)";
const rule = "var(--ts-rule, #e2ded2)";
const sans = "var(--ts-sans, system-ui, sans-serif)";
const mono = "var(--ts-mono, ui-monospace, monospace)";

/**
 * An arrowhead, defined once per figure.
 *
 * Identifiers have to be unique in a page that carries more than one figure,
 * so every figure takes a prefix rather than trusting a constant.
 */
function Arrowhead({ id }) {
  return (
    <defs>
      <marker
        id={id}
        viewBox="0 0 8 8"
        refX="7"
        refY="4"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 1 L 7 4 L 0 7 z" fill={muted} />
      </marker>
    </defs>
  );
}

function Box({ x, y, width, height, label, kind }) {
  const isValue = kind === "value";
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="4"
        fill={isValue ? panel : paper}
        stroke={isValue ? rule : accent}
        stroke-width={isValue ? "1" : "1.5"}
      />
      <text
        x={x + width / 2}
        y={y + height / 2}
        text-anchor="middle"
        dominant-baseline="central"
        font-family={isValue ? mono : sans}
        font-size={isValue ? "12.5" : "13"}
        fill={ink}
      >
        {label}
      </text>
    </g>
  );
}

/**
 * The processing pipeline, as two rails.
 *
 * Left is what runs, right is what it produces. The shape carries the
 * architecture's actual claim — code and data alternate, and every stage's
 * output is a value the next stage receives — which a single column of
 * identical boxes does not.
 */
export function Pipeline({ id, title, description, steps }) {
  const boxWidth = 168;
  const boxHeight = 40;
  const rowHeight = 62;
  const columnGap = 44;
  const width = boxWidth * 2 + columnGap;
  const height = steps.length * rowHeight + 8;
  const marker = `${id}-arrow`;

  const positioned = steps.map((step, index) => ({
    ...step,
    x: step.kind === "value" ? boxWidth + columnGap : 0,
    y: index * rowHeight + 4,
  }));

  return (
    <svg
      role="img"
      aria-labelledby={`${id}-title ${id}-desc`}
      viewBox={`0 0 ${width} ${height}`}
      style={`width:100%;max-width:${width}px;height:auto;display:block;margin:0 auto`}
    >
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-desc`}>{description}</desc>
      <Arrowhead id={marker} />

      {positioned.slice(1).map((step, index) => {
        const from = positioned[index];
        const startX = from.x + boxWidth / 2;
        const startY = from.y + boxHeight;
        const endX = step.x + boxWidth / 2;
        const endY = step.y;
        const midY = (startY + endY) / 2;
        return (
          <polyline
            key={step.label}
            points={`${startX},${startY} ${startX},${midY} ${endX},${midY} ${endX},${endY}`}
            fill="none"
            stroke={muted}
            stroke-width="1.25"
            marker-end={`url(#${marker})`}
          />
        );
      })}

      {positioned.map((step) => (
        <Box
          key={step.label}
          x={step.x}
          y={step.y}
          width={boxWidth}
          height={boxHeight}
          label={step.label}
          kind={step.kind}
        />
      ))}
    </svg>
  );
}

/**
 * A layered dependency graph.
 *
 * Layers are given top to bottom and every edge points downward, which is the
 * repository's rule rather than a drawing convention: a graph that could not
 * be drawn this way would be a graph that broke the rule.
 */
export function PackageGraph({ id, title, description, layers, edges }) {
  const fontSize = 12;
  const longest = Math.max(...layers.flat().map((node) => node.name.length));
  // Monospace, so the widest label's width is arithmetic rather than a guess.
  // A box sized to the longest name keeps every box the same width without
  // clipping the one that made it necessary.
  const boxWidth = Math.max(152, Math.ceil(longest * fontSize * 0.62) + 28);
  const boxHeight = 38;
  const columnGap = 16;
  const rowHeight = 86;
  const widest = Math.max(...layers.map((layer) => layer.length));
  const width = widest * boxWidth + (widest - 1) * columnGap;
  const height = layers.length * rowHeight - (rowHeight - boxHeight) + 8;
  const marker = `${id}-arrow`;

  const nodes = new Map();
  layers.forEach((layer, row) => {
    const rowWidth = layer.length * boxWidth + (layer.length - 1) * columnGap;
    const offset = (width - rowWidth) / 2;
    layer.forEach((node, column) => {
      nodes.set(node.name, {
        ...node,
        x: offset + column * (boxWidth + columnGap),
        y: row * rowHeight + 4,
      });
    });
  });

  return (
    // A custom element rather than a `div`, because a `div` is structure and
    // structure belongs to the shell: the Semantic AST passes its children
    // through and the wrapper never reaches the page. An element the AST has
    // no meaning for is preserved as written, which is exactly what a scroll
    // container has to be.
    //
    // Focusable, like the theme's code blocks: a region that scrolls sideways
    // is a region somebody has to be able to scroll without a mouse. The name
    // is the figure's, so the stop is announced as something.
    <scroll-region
      style="display:block;overflow-x:auto"
      tabindex="0"
      role="group"
      aria-label={title}
    >
      <svg
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        viewBox={`0 0 ${width} ${height}`}
        style={`width:100%;min-width:${Math.min(width, 560)}px;height:auto;display:block;margin:0 auto`}
      >
        <title id={`${id}-title`}>{title}</title>
        <desc id={`${id}-desc`}>{description}</desc>
        <Arrowhead id={marker} />

        {edges.map((edge) => {
          const from = nodes.get(edge.from);
          const to = nodes.get(edge.to);
          const startX = from.x + boxWidth / 2;
          const startY = from.y + boxHeight;
          const endX = to.x + boxWidth / 2;
          const endY = to.y;
          const midY = (startY + endY) / 2;
          return (
            <polyline
              key={`${edge.from}-${edge.to}`}
              points={`${startX},${startY} ${startX},${midY} ${endX},${midY} ${endX},${endY}`}
              fill="none"
              stroke={muted}
              stroke-width="1.25"
              stroke-dasharray={edge.conditional ? "4 3" : undefined}
              marker-end={`url(#${marker})`}
            />
          );
        })}

        {[...nodes.values()].map((node) => (
          <g key={node.name}>
            <rect
              x={node.x}
              y={node.y}
              width={boxWidth}
              height={boxHeight}
              rx="4"
              fill={node.optional ? paper : panel}
              stroke={node.optional ? accent : rule}
              stroke-width={node.optional ? "1.5" : "1"}
              stroke-dasharray={node.optional ? "4 3" : undefined}
            />
            <text
              x={node.x + boxWidth / 2}
              y={node.y + boxHeight / 2}
              text-anchor="middle"
              dominant-baseline="central"
              font-family={mono}
              font-size={fontSize}
              fill={ink}
            >
              {node.name}
            </text>
            {/* The note is knocked out of the connector that passes behind
                it, so it stays readable without moving away from its box. */}
            {node.note ? (
              <text
                x={node.x + boxWidth / 2}
                y={node.y + boxHeight + 14}
                text-anchor="middle"
                font-family={sans}
                font-size="11"
                fill={muted}
                stroke={paper}
                stroke-width="3"
                paint-order="stroke"
              >
                {node.note}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </scroll-region>
  );
}
