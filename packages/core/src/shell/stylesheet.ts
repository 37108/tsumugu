/**
 * The application shell's stylesheet.
 *
 * Layout, navigation, landmarks, diagnostics — the page around the document.
 * Document content is the theme's, and nothing here reaches inside
 * `.tsumugu-doc` to restyle it: the two stylesheets meet at that class name and
 * nowhere else, which is what keeps "swap the theme" from meaning "and the
 * sidebar moved".
 *
 * Three properties this file has to keep, because a documentation server is
 * judged on them long before it is judged on taste:
 *
 * - **It works without JavaScript.** The narrow-screen navigation is a
 *   `details` element, which browsers open and close themselves.
 * - **It never scrolls sideways.** Long content scrolls inside its own box.
 * - **Focus is always visible**, and the reader who has asked for less motion
 *   gets none.
 */
export const shellStylesheet = `
:root {
  --ts-ink: #1a1c22;
  --ts-ink-muted: #5a5f6b;
  --ts-paper: #fcfbf8;
  --ts-panel: #f7f5ef;
  --ts-indigo: #274177;
  --ts-rule: #e2ded2;
  --ts-warning: #8a5a10;
  --ts-error: #9a2b23;
  --ts-sans: system-ui, -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
  --ts-serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Hiragino Mincho ProN", "Yu Mincho", Georgia, serif;
  --ts-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

  /* Both, stated rather than left to the browser, so form controls, scrollbars
     and the space beyond the page match whichever one the reader is in. */
  color-scheme: light dark;
}

/*
 * Dark mode.
 *
 * The same design in the other direction rather than an inversion of it: sumi
 * ink and washi paper trade places, and the 藍 indigo is lifted until it reads
 * as a link on a dark ground instead of disappearing into it. Every pair below
 * clears the project's 4.5:1 target; the muted greys clear it too, because
 * "secondary" is not a licence to be unreadable.
 *
 * A preference, not a toggle. The reader has already told their operating
 * system which they want, and a control that asks again is a control that can
 * disagree with them.
 */
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
  background: var(--ts-paper);
  color: var(--ts-ink);
  font-family: var(--ts-sans);
  margin: 0;
  /* No 300ms wait before a tap becomes a click, and no grey flash over the
     link that was tapped. */
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
}

.tsumugu-skip {
  background: var(--ts-indigo);
  color: #fff;
  inset-block-start: 0.5rem;
  inset-inline-start: 0.5rem;
  padding: 0.7rem 1rem;
  position: fixed;
  transform: translateY(-200%);
  z-index: 10;
}

.tsumugu-skip:focus-visible {
  transform: none;
}

.tsumugu-shell {
  display: grid;
  gap: 0 2.5rem;
  grid-template-areas:
    "header"
    "sidebar"
    "main"
    "toc"
    "footer";
  margin-inline: auto;
  max-width: 84rem;
  padding-inline: 1.25rem;
}

.tsumugu-header {
  align-items: center;
  border-block-end: 1px solid var(--ts-rule);
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  grid-area: header;
  justify-content: space-between;
  padding-block: 1.4rem;
}

/* Search ----------------------------------------------------------------- */

.tsumugu-search {
  flex: 1 1 12rem;
  max-width: 22rem;
  position: relative;
}

.tsumugu-search input {
  background: var(--ts-panel);
  border: 1px solid var(--ts-rule);
  border-radius: 6px;
  color: var(--ts-ink);
  font: inherit;
  font-size: 0.9rem;
  inline-size: 100%;
  padding: 0.5rem 0.7rem;
}

.tsumugu-search input::placeholder {
  color: var(--ts-ink-muted);
}

.tsumugu-search ul {
  background: var(--ts-paper);
  border: 1px solid var(--ts-rule);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 12%);
  inset-block-start: calc(100% + 0.4rem);
  inset-inline: 0;
  list-style: none;
  margin: 0;
  max-height: min(24rem, 60dvh);
  overflow-y: auto;
  padding: 0.3rem;
  position: absolute;
  z-index: 5;
}

.tsumugu-search li a {
  border-radius: 5px;
  color: var(--ts-ink);
  display: grid;
  gap: 0.1rem;
  padding: 0.5rem 0.6rem;
  text-decoration: none;
}

.tsumugu-search li[aria-selected="true"] a,
.tsumugu-search li a:hover {
  background: var(--ts-panel);
}

.tsumugu-search-title {
  font-size: 0.9rem;
}

.tsumugu-search-context {
  color: var(--ts-ink-muted);
  font-size: 0.775rem;
}

/*
 * The copy control the page client adds to code blocks.
 *
 * Styled here because the shell owns the control, even though it sits inside
 * theme markup; the class is the boundary. Revealed on hover or focus on a
 * fine pointer, always present on a coarse one, where hover does not exist.
 */
.tsumugu-doc pre {
  position: relative;
}

.tsumugu-copy {
  background: var(--ts-paper);
  border: 1px solid var(--ts-rule);
  border-radius: 5px;
  color: var(--ts-ink-muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  inset-block-start: 0.5rem;
  inset-inline-end: 0.5rem;
  opacity: 0;
  padding: 0.3rem 0.6rem;
  position: absolute;
  transition: opacity 160ms cubic-bezier(0.32, 0.72, 0, 1);
}

.tsumugu-doc pre:hover .tsumugu-copy,
.tsumugu-doc pre:focus-within .tsumugu-copy,
.tsumugu-copy:focus-visible {
  opacity: 1;
}

.tsumugu-copy:hover {
  color: var(--ts-ink);
}

@media (hover: none) {
  .tsumugu-copy {
    opacity: 1;
  }
}

/*
 * Available to a screen reader, invisible to everyone else. The clip-path is
 * what keeps it out of the layout without "display: none", which would take it
 * out of the accessibility tree as well.
 */
.tsumugu-visually-hidden {
  block-size: 1px;
  clip-path: inset(50%);
  inline-size: 1px;
  margin: -1px;
  overflow: hidden;
  padding: 0;
  position: absolute;
  white-space: nowrap;
}

.tsumugu-brand {
  color: var(--ts-ink);
  font-family: var(--ts-serif);
  font-size: 1.15rem;
  letter-spacing: 0.01em;
  text-decoration: none;
}

.tsumugu-brand:hover {
  color: var(--ts-indigo);
}

.tsumugu-sidebar {
  grid-area: sidebar;
  padding-block: 1rem;
}

.tsumugu-main {
  grid-area: main;
  min-width: 0;
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

/* Navigation ------------------------------------------------------------- */

.tsumugu-sidebar ul,
.tsumugu-toc ol {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tsumugu-sidebar li ul {
  border-inline-start: 1px solid var(--ts-rule);
  margin-inline-start: 0.55rem;
  padding-inline-start: 0.7rem;
}

.tsumugu-sidebar a,
.tsumugu-nav-group {
  border-radius: 4px;
  color: var(--ts-ink-muted);
  display: block;
  font-size: 0.925rem;
  /* Comfortably past the 44px target on a touch screen, counting the gap
     between rows. */
  padding: 0.55rem 0.5rem;
  text-decoration: none;
  transition: color 160ms cubic-bezier(0.32, 0.72, 0, 1);
}

.tsumugu-sidebar a:hover {
  color: var(--ts-ink);
}

.tsumugu-nav-group {
  color: var(--ts-ink);
  font-weight: 600;
}

.tsumugu-sidebar li[data-active] > a,
.tsumugu-sidebar li[data-active] > .tsumugu-nav-group {
  color: var(--ts-ink);
  font-weight: 600;
}

/* The thread again: the current page is marked, not merely coloured. */
.tsumugu-sidebar a[aria-current="page"] {
  background: var(--ts-panel);
  box-shadow: inset 2px 0 0 var(--ts-indigo);
  color: var(--ts-indigo);
}

.tsumugu-disclosure > summary {
  color: var(--ts-ink);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 0.6rem 0.5rem;
  text-transform: uppercase;
}

.tsumugu-toc h2 {
  color: var(--ts-ink-muted);
  font-family: var(--ts-sans);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  margin: 0 0 0.5rem;
  text-transform: uppercase;
}

.tsumugu-toc a {
  color: var(--ts-ink-muted);
  display: block;
  font-size: 0.875rem;
  padding: 0.4rem 0;
  text-decoration: none;
}

.tsumugu-toc a:hover {
  color: var(--ts-indigo);
}

.tsumugu-toc li ol {
  padding-inline-start: 0.9rem;
}

:focus-visible {
  border-radius: 3px;
  outline: 2px solid var(--ts-indigo);
  outline-offset: 2px;
}

/* Diagnostics ------------------------------------------------------------ */

.tsumugu-diagnostics {
  border: 1px solid var(--ts-rule);
  border-radius: 8px;
  margin-block-start: 3rem;
  padding: 1rem 1.2rem;
}

.tsumugu-diagnostics h2 {
  font-family: var(--ts-sans);
  font-size: 0.95rem;
  margin: 0 0 0.75rem;
}

.tsumugu-diagnostics ul {
  display: grid;
  gap: 0.9rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.tsumugu-diagnostics li {
  display: grid;
  font-size: 0.875rem;
  gap: 0.2rem;
}

.tsumugu-severity {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

li[data-severity="warning"] .tsumugu-severity {
  color: var(--ts-warning);
}

li[data-severity="error"] .tsumugu-severity,
li[data-severity="fatal"] .tsumugu-severity {
  color: var(--ts-error);
}

.tsumugu-hint {
  color: var(--ts-ink-muted);
}

.tsumugu-diagnostics code {
  color: var(--ts-ink-muted);
  font-family: var(--ts-mono);
  font-size: 0.75rem;
}

/* Wide layout ------------------------------------------------------------ */

@media (min-width: 64rem) {
  .tsumugu-shell {
    grid-template-areas:
      "header header header"
      "sidebar main toc"
      "footer footer footer";
    grid-template-columns: 15rem minmax(0, 1fr) 13rem;
  }

  /* The disclosure is a narrow-screen affordance. With room for a sidebar the
     list is simply the sidebar, and the control that opens it would be a
     control that does nothing. */
  .tsumugu-disclosure > summary {
    display: none;
  }

  .tsumugu-sidebar,
  .tsumugu-toc {
    align-self: start;
    max-height: calc(100dvh - 6rem);
    overflow-y: auto;
    position: sticky;
    top: 1.5rem;
  }
}

/* Without a table of contents the content takes the space back rather than
   leaving a column of nothing beside it. */
@media (min-width: 64rem) {
  .tsumugu-shell:not([data-contents]) {
    grid-template-columns: 15rem minmax(0, 1fr);
    grid-template-areas:
      "header header"
      "sidebar main"
      "footer footer";
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
`;
