/**
 * The application shell's stylesheet.
 *
 * GENERATED from `shell.css` by `scripts/build-styles.mjs` — edit the
 * CSS, then run `pnpm styles`. The authored file carries the reasoning;
 * this one carries the bytes the pages ship.
 */
export const shellStylesheet = `
@layer properties;
:root {
  --ts-ink: #1a1c22;
  --ts-ink-muted: #5a5f6b;
  --ts-paper: #fcfbf8;
  --ts-panel: #f7f5ef;
  --ts-indigo: #274177;
  --ts-rule: #e2ded2;
  --ts-warning: #8a5a10;
  --ts-error: #9a2b23;
  --ts-sans: system-ui, -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN",
    "Noto Sans JP", sans-serif;
  --ts-serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Hiragino Mincho ProN",
    "Yu Mincho", Georgia, serif;
  --ts-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono",
    monospace;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ts-ink: #e7e5df;
    --ts-ink-muted: #a6aab4;
    --ts-paper: #14161b;
    --ts-panel: #1d2028;
    --ts-indigo: #9db8e8;
    --ts-rule: #2b2f38;
    --ts-warning: #e0b571;
    --ts-error: #ef9d94;
  }
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--ts-paper);
  color: var(--ts-ink);
  font-family: var(--ts-sans);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
}
.tsumugu-skip {
  position: fixed;
  z-index: 10;
  padding-inline: calc(0.25rem * 4);
  padding-block: calc(0.25rem * 3);
  background: var(--ts-indigo);
  color: #fff;
  inset-block-start: 0.5rem;
  inset-inline-start: 0.5rem;
  transform: translateY(-200%);
}
.tsumugu-skip:focus-visible {
  transform: none;
}
.tsumugu-shell {
  margin-inline: auto;
  max-width: 80rem;
  display: grid;
  gap: 0 2.5rem;
  grid-template-areas: "header" "sidebar" "main" "toc" "footer";
  padding-inline: 1.25rem;
}
.tsumugu-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: calc(0.25rem * 4);
  border-block-end: 1px solid var(--ts-rule);
  grid-area: header;
  padding-block: 1.4rem;
}
.tsumugu-brand {
  text-decoration-line: none;
  color: var(--ts-ink);
  font-family: var(--ts-serif);
  font-size: 1.15rem;
  letter-spacing: 0.01em;
}
.tsumugu-brand:hover {
  color: var(--ts-indigo);
}
.tsumugu-search {
  position: relative;
  max-width: 24rem;
  flex: auto;
  flex-basis: 12rem;
}
.tsumugu-search input {
  width: 100%;
  border-radius: 0.375rem;
  padding-inline: calc(0.25rem * 3);
  padding-block: calc(0.25rem * 2);
  background: var(--ts-panel);
  border: 1px solid var(--ts-rule);
  color: var(--ts-ink);
  font: inherit;
  font-size: 0.9rem;
}
.tsumugu-search input::placeholder {
  color: var(--ts-ink-muted);
}
.tsumugu-search ul {
  position: absolute;
  z-index: 5;
  margin: 0;
  overflow-y: auto;
  border-radius: 0.5rem;
  padding: 0.25rem;
  background: var(--ts-paper);
  border: 1px solid var(--ts-rule);
  box-shadow: 0 12px 32px rgb(0 0 0 / 12%);
  inset-block-start: calc(100% + 0.4rem);
  inset-inline: 0;
  list-style: none;
  max-height: min(24rem, 60dvh);
}
.tsumugu-search li a {
  display: grid;
  gap: calc(0.25rem * 0.5);
  border-radius: 5px;
  padding-inline: calc(0.25rem * 2.5);
  padding-block: calc(0.25rem * 2);
  text-decoration-line: none;
  color: var(--ts-ink);
}
.tsumugu-search li[aria-selected="true"] a, .tsumugu-search li a:hover {
  background: var(--ts-panel);
}
.tsumugu-search-title {
  font-size: 0.9rem;
}
.tsumugu-search-context {
  color: var(--ts-ink-muted);
  font-size: 0.775rem;
}
.tsumugu-sidebar {
  grid-area: sidebar;
  padding-block: 1rem;
}
.tsumugu-main {
  min-width: 0;
  grid-area: main;
  padding-block: 1.5rem 3rem;
}
.tsumugu-toc {
  grid-area: toc;
  padding-block: 1rem 2rem;
}
.tsumugu-footer {
  border-block-start: 1px solid var(--ts-rule);
  color: var(--ts-ink-muted);
  font-size: 0.85rem;
  grid-area: footer;
  padding-block: 1.5rem 2.5rem;
}
.tsumugu-footer p {
  margin: 0;
}
.tsumugu-sidebar ul, .tsumugu-toc ol {
  margin: 0;
  list-style-type: none;
  padding: 0;
}
.tsumugu-sidebar li ul {
  border-inline-start: 1px solid var(--ts-rule);
  margin-inline-start: 0.55rem;
  padding-inline-start: 0.7rem;
}
.tsumugu-sidebar a, .tsumugu-nav-group {
  display: block;
  border-radius: 0.25rem;
  text-decoration-line: none;
  color: var(--ts-ink-muted);
  font-size: 0.925rem;
  padding: 0.55rem 0.5rem;
  transition: color 160ms cubic-bezier(0.32, 0.72, 0, 1);
}
.tsumugu-sidebar a:hover {
  color: var(--ts-ink);
}
.tsumugu-nav-group {
  --tw-font-weight: 600;
  font-weight: 600;
  color: var(--ts-ink);
}
.tsumugu-sidebar li[data-active] > a, .tsumugu-sidebar li[data-active] > .tsumugu-nav-group {
  --tw-font-weight: 600;
  font-weight: 600;
  color: var(--ts-ink);
}
.tsumugu-sidebar a[aria-current="page"] {
  background: var(--ts-panel);
  box-shadow: inset 2px 0 0 var(--ts-indigo);
  color: var(--ts-indigo);
}
.tsumugu-disclosure > summary {
  cursor: pointer;
  --tw-font-weight: 600;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--ts-ink);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  padding: 0.6rem 0.5rem;
}
.tsumugu-toc h2 {
  margin: 0;
  margin-bottom: calc(0.25rem * 2);
  --tw-font-weight: 600;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--ts-ink-muted);
  font-family: var(--ts-sans);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
}
.tsumugu-toc a {
  display: block;
  padding-block: calc(0.25rem * 1.5);
  text-decoration-line: none;
  color: var(--ts-ink-muted);
  font-size: 0.875rem;
}
.tsumugu-toc a:hover {
  color: var(--ts-indigo);
}
.tsumugu-toc a[aria-current="location"] {
  box-shadow: inset 2px 0 0 var(--ts-indigo);
  color: var(--ts-indigo);
  padding-inline-start: 0.6rem;
}
.tsumugu-toc li ol {
  padding-inline-start: 0.9rem;
}
:focus-visible {
  border-radius: 3px;
  outline: 2px solid var(--ts-indigo);
  outline-offset: 2px;
}
.tsumugu-diagnostics {
  border-radius: 0.5rem;
  border: 1px solid var(--ts-rule);
  margin-block-start: 3rem;
  padding: 1rem 1.2rem;
}
.tsumugu-diagnostics h2 {
  margin: 0;
  margin-bottom: calc(0.25rem * 3);
  font-family: var(--ts-sans);
  font-size: 0.95rem;
}
.tsumugu-diagnostics > ul {
  margin: 0;
  display: grid;
  list-style-type: none;
  gap: calc(0.25rem * 3.5);
  padding: 0;
}
.tsumugu-diagnostics > ul > li {
  display: grid;
  gap: 0.25rem;
  font-size: 0.875rem;
  min-width: 0;
}
.tsumugu-severity {
  --tw-font-weight: 700;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
}
li[data-severity="warning"] .tsumugu-severity {
  color: var(--ts-warning);
}
li[data-severity="error"] .tsumugu-severity, li[data-severity="fatal"] .tsumugu-severity {
  color: var(--ts-error);
}
.tsumugu-hint {
  color: var(--ts-ink-muted);
}
.tsumugu-location {
  overflow-wrap: anywhere;
}
.tsumugu-related {
  margin: 0;
  display: grid;
  list-style-type: none;
  gap: 0.25rem;
  padding: 0;
  border-inline-start: 1px solid var(--ts-rule);
  padding-inline-start: 0.75rem;
}
.tsumugu-related li {
  display: grid;
  gap: calc(0.25rem * 0.5);
  font-size: 0.8rem;
  min-width: 0;
}
.tsumugu-related-message {
  color: var(--ts-ink-muted);
}
.tsumugu-diagnostics code {
  color: var(--ts-ink-muted);
  font-family: var(--ts-mono);
  font-size: 0.75rem;
}
.tsumugu-doc pre {
  position: relative;
}
.tsumugu-copy {
  position: absolute;
  cursor: pointer;
  border-radius: 5px;
  opacity: 0%;
  background: var(--ts-paper);
  border: 1px solid var(--ts-rule);
  color: var(--ts-ink-muted);
  font: inherit;
  font-size: 0.75rem;
  inset-block-start: 0.5rem;
  inset-inline-end: 0.5rem;
  padding: 0.3rem 0.6rem;
  transition: opacity 160ms cubic-bezier(0.32, 0.72, 0, 1);
}
.tsumugu-doc pre:hover .tsumugu-copy, .tsumugu-doc pre:focus-within .tsumugu-copy, .tsumugu-copy:focus-visible {
  opacity: 100%;
}
.tsumugu-copy:hover {
  color: var(--ts-ink);
}
@media (hover: none) {
  .tsumugu-copy {
    opacity: 100%;
  }
}
.tsumugu-visually-hidden {
  position: absolute;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  white-space: nowrap;
  block-size: 1px;
  clip-path: inset(50%);
  inline-size: 1px;
}
@media (min-width: 64rem) {
  .tsumugu-shell {
    grid-template-areas: "header header header" "sidebar main toc" "footer footer footer";
    grid-template-columns: 15rem minmax(0, 1fr) 13rem;
  }
  @supports selector(details::details-content) {
    .tsumugu-disclosure > summary {
      display: none;
    }
    .tsumugu-disclosure::details-content {
      content-visibility: visible;
    }
  }
  .tsumugu-sidebar, .tsumugu-toc {
    position: sticky;
    align-self: flex-start;
    overflow-y: auto;
    max-height: calc(100dvh - 6rem);
    top: 1.5rem;
  }
}
@media (min-width: 64rem) {
  .tsumugu-shell:not([data-contents]) {
    grid-template-columns: 15rem minmax(0, 1fr);
    grid-template-areas: "header header" "sidebar main" "footer footer";
  }
}
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
@property --tw-font-weight {
  syntax: "*";
  inherits: false;
}
@layer properties {
  @supports ((-webkit-hyphens: none) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color:rgb(from red r g b)))) {
    *, ::before, ::after, ::backdrop {
      --tw-font-weight: initial;
    }
  }
}
`;
