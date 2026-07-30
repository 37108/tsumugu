/**
 * The default theme's stylesheet.
 *
 * GENERATED from `theme.css` by `scripts/build-styles.mjs` — edit the
 * CSS, then run `pnpm styles`. The authored file carries the reasoning;
 * this one carries the bytes the pages ship.
 */
export const stylesheet = `
.tsumugu-doc {
  --doc-ink: #1a1c22;
  --doc-ink-muted: #5a5f6b;
  --doc-paper: #fcfbf8;
  --doc-indigo: #274177;
  --doc-indigo-bright: #35569a;
  --doc-rule: #e2ded2;
  --doc-surface: #f3f1e9;
  --doc-measure: 68ch;
  --doc-rhythm: 1.7;
  --doc-serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Hiragino Mincho ProN",
    "Yu Mincho", Georgia, serif;
  --doc-sans: system-ui, -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN",
    "Noto Sans JP", sans-serif;
  --doc-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono",
    monospace;
  color: var(--doc-ink);
  font-family: var(--doc-sans);
  font-size: 1.0625rem;
  line-height: var(--doc-rhythm);
  max-width: var(--doc-measure);
  overflow-wrap: break-word;
}
@media (prefers-color-scheme: dark) {
  .tsumugu-doc {
    --doc-ink: #e7e5df;
    --doc-ink-muted: #a6aab4;
    --doc-paper: #14161b;
    --doc-indigo: #9db8e8;
    --doc-indigo-bright: #c2d3f2;
    --doc-rule: #2b2f38;
    --doc-surface: #1d2028;
  }
}
.tsumugu-doc > * + * {
  margin-block-start: 1.4em;
}
.tsumugu-doc h1, .tsumugu-doc h2, .tsumugu-doc h3, .tsumugu-doc h4, .tsumugu-doc h5, .tsumugu-doc h6 {
  position: relative;
  text-wrap: balance;
  font-weight: 600;
  font-family: var(--doc-serif);
  line-height: 1.25;
  letter-spacing: -0.01em;
  scroll-margin-top: 1.5rem;
}
.tsumugu-doc h1 {
  font-size: clamp(2rem, 1.6rem + 1.8vw, 2.75rem);
  margin-block-end: 0.6em;
}
.tsumugu-doc h2 {
  font-size: 1.6rem;
  margin-block-start: 2.4em;
  padding-block-start: 0.9rem;
}
.tsumugu-doc h2::before {
  content: "";
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  width: 2.5rem;
  height: 2px;
  background: var(--doc-indigo);
}
.tsumugu-doc h3 {
  font-size: 1.28rem;
  margin-block-start: 2em;
}
.tsumugu-doc h4, .tsumugu-doc h5, .tsumugu-doc h6 {
  font-size: 1.06rem;
  margin-block-start: 1.8em;
}
.tsumugu-anchor {
  text-decoration-line: none;
  opacity: 0%;
  color: var(--doc-indigo);
  font-family: var(--doc-mono);
  font-size: 0.8em;
  font-weight: 400;
  margin-inline-start: 0.4em;
}
.tsumugu-doc :is(h1, h2, h3, h4, h5, h6):hover .tsumugu-anchor, .tsumugu-anchor:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .tsumugu-anchor {
    opacity: 0.55;
  }
}
.tsumugu-doc a {
  color: var(--doc-indigo);
  text-decoration-color: var(--doc-indigo);
  @supports (color: color-mix(in lab, red, red)) {
    text-decoration-color: color-mix(in srgb, var(--doc-indigo) 35%, transparent);
  }
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
  transition: color 160ms cubic-bezier(0.32, 0.72, 0, 1);
}
.tsumugu-doc a:hover {
  color: var(--doc-indigo-bright);
  text-decoration-color: currentColor;
}
.tsumugu-doc :focus-visible {
  border-radius: 2px;
  outline: 2px solid var(--doc-indigo);
  outline-offset: 3px;
}
.tsumugu-doc ul, .tsumugu-doc ol {
  padding-inline-start: 1.4em;
}
.tsumugu-doc li + li {
  margin-block-start: 0.4em;
}
.tsumugu-doc li p {
  margin-block: 0.15em;
}
.tsumugu-doc .tsumugu-task-item {
  list-style: none;
}
.tsumugu-doc .tsumugu-task-item > input[type="checkbox"] {
  accent-color: var(--doc-indigo);
  margin-inline: -1.4em 0.5em;
}
.tsumugu-doc .tsumugu-task-item > p:first-of-type {
  display: inline;
}
.tsumugu-doc li > ul, .tsumugu-doc li > ol {
  margin-block-start: 0.35em;
}
.tsumugu-doc blockquote {
  border-inline-start: 2px solid var(--doc-indigo);
  color: var(--doc-ink-muted);
  font-style: normal;
  margin-inline: 0;
  padding-inline-start: 1.2em;
}
.tsumugu-doc code {
  background: var(--doc-surface);
  border-radius: 3px;
  font-family: var(--doc-mono);
  font-size: 0.9em;
  padding: 0.12em 0.34em;
}
.tsumugu-doc pre {
  overflow-x: auto;
  background: var(--doc-surface);
  border: 1px solid var(--doc-rule);
  border-radius: 6px;
  padding: 1rem 1.1rem;
}
.tsumugu-doc pre code {
  padding: 0;
  background: none;
  font-size: 0.875rem;
  line-height: 1.6;
}
.tsumugu-doc pre code span {
  color: var(--tsumugu-code, inherit);
}
@media (prefers-color-scheme: dark) {
  .tsumugu-doc pre code span {
    color: var(--tsumugu-code-dark, var(--tsumugu-code, inherit));
  }
}
.tsumugu-table-scroll {
  overflow-x: auto;
}
.tsumugu-doc table {
  min-width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}
.tsumugu-doc :is(th, td) {
  vertical-align: top;
  border-block-end: 1px solid var(--doc-rule);
  padding: 0.55rem 0.9rem 0.55rem 0;
  text-align: start;
}
.tsumugu-doc th {
  font-weight: 600;
  letter-spacing: 0.02em;
}
.tsumugu-doc img {
  height: auto;
  max-width: 100%;
}
.tsumugu-doc hr {
  border: 0;
  border-block-start: 1px solid var(--doc-rule);
  margin-block: 2.5em;
}
.tsumugu-doc [data-tsumugu-unsupported], .tsumugu-doc [data-tsumugu-raw-html] {
  border-inline-start: 2px solid var(--doc-ink-muted);
  color: var(--doc-ink-muted);
  font-size: 0.85rem;
}
.tsumugu-doc .tsumugu-diagram {
  margin-inline: 0;
}
.tsumugu-doc .tsumugu-diagram-scroll {
  overflow-x: auto;
}
.tsumugu-doc .tsumugu-diagram svg {
  color: var(--doc-ink);
  font-family: var(--doc-sans);
  max-inline-size: none;
}
.tsumugu-doc .tsumugu-diagram :is(rect, ellipse, polygon) {
  fill: var(--doc-surface);
  stroke: var(--doc-rule);
  stroke-width: 1;
}
.tsumugu-doc .tsumugu-diagram text {
  fill: currentColor;
  font-size: 13px;
}
.tsumugu-doc .tsumugu-diagram :is(.tsumugu-diagram-edge, .tsumugu-diagram-lifeline) {
  fill: none;
  stroke: var(--doc-indigo);
  stroke-width: 1.5;
}
.tsumugu-doc .tsumugu-diagram .tsumugu-diagram-lifeline {
  stroke: var(--doc-rule);
  stroke-dasharray: 4 4;
}
.tsumugu-doc .tsumugu-diagram .tsumugu-diagram-edge-dashed {
  stroke-dasharray: 5 4;
}
.tsumugu-doc .tsumugu-diagram .tsumugu-diagram-arrow {
  fill: var(--doc-indigo);
  stroke: none;
}
.tsumugu-doc .tsumugu-diagram .tsumugu-diagram-label {
  fill: var(--doc-ink-muted);
  font-size: 12px;
}
.tsumugu-doc .tsumugu-diagram .tsumugu-diagram-label-backdrop {
  fill: var(--doc-paper);
  stroke: none;
}
.tsumugu-doc .tsumugu-diagram .tsumugu-diagram-note :is(rect, polygon) {
  fill: var(--doc-surface);
  stroke: var(--doc-ink-muted);
}
@media (prefers-reduced-motion: reduce) {
  .tsumugu-doc * {
    transition: none;
  }
}
`;
