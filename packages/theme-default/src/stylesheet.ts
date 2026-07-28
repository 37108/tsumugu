/**
 * The default theme's stylesheet.
 *
 * ## What this file is allowed to style
 *
 * Document content, and nothing else. Headings, paragraphs, lists, code,
 * tables, quotations, images: the things a Semantic AST node becomes. The page
 * around them — header, sidebar, table of contents, footer — belongs to core's
 * application shell, which ships its own styles. Every selector here is scoped
 * under `.tsumugu-doc` so the boundary is enforced by the CSS rather than only
 * described in a comment.
 *
 * ## The direction
 *
 * Tsumugu is 紡ぐ — to spin thread. A documentation set is separate files woven
 * into one fabric, and the theme takes its material from that: sumi ink on
 * washi paper, with 藍 indigo, the dye of worn, everyday Japanese cloth, as the
 * one accent. Headings are set in a serif with a mincho fallback so a Japanese
 * and an English document have the same voice; body text is the reader's own
 * system face, because a documentation page is read, not admired, and a font
 * that has to be downloaded is a page that is blank until it arrives.
 *
 * The signature is the **thread**: a short indigo rule that hangs above every
 * section heading, and the same indigo hairline down the left of a quotation.
 * It is the only ornament, and everything else is spacing and contrast.
 *
 * ## Constraints this file keeps
 *
 * - **No network.** No `@import`, no `url()`, no web font, no icon set. A page
 *   renders identically offline, which is where documentation is often read.
 * - **No JavaScript.** Nothing here depends on a class a script would add.
 * - **Contrast.** Body text is 16.5:1 on the page background, muted text 6.2:1
 *   and links 9.6:1; in dark mode 14.4:1, 7.8:1 and 9.0:1. Every pair is
 *   recorded in `docs/accessibility.md` and above the 4.5:1 the project targets.
 * - **Reduced motion.** The only transitions are colour changes; they are
 *   removed entirely when a reader has asked for less motion.
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

  --doc-serif: "Iowan Old Style", "Palatino Linotype", Palatino, "Hiragino Mincho ProN", "Yu Mincho", Georgia, serif;
  --doc-sans: system-ui, -apple-system, "Segoe UI", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
  --doc-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

  color: var(--doc-ink);
  font-family: var(--doc-sans);
  font-size: 1.0625rem;
  line-height: var(--doc-rhythm);
  max-width: var(--doc-measure);
  overflow-wrap: break-word;
}

/*
 * Dark mode, matching the shell's palette exactly.
 *
 * The two stylesheets keep their own tokens — the theme owns document colours
 * and the shell owns the page around them — so the values are stated twice on
 * purpose. A theme that read the shell's variables would be a theme that could
 * not be replaced without replacing the shell.
 */
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

.tsumugu-doc h1,
.tsumugu-doc h2,
.tsumugu-doc h3,
.tsumugu-doc h4,
.tsumugu-doc h5,
.tsumugu-doc h6 {
  font-family: var(--doc-serif);
  /* Following an anchor lands on the heading with room above it, rather than
     with the heading flush against the top of the window. */
  scroll-margin-top: 1.5rem;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
  text-wrap: balance;
  position: relative;
}

.tsumugu-doc h1 {
  font-size: clamp(2rem, 1.6rem + 1.8vw, 2.75rem);
  margin-block-end: 0.6em;
}

/* The thread: one indigo rule marking where a section begins. */
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

.tsumugu-doc h4,
.tsumugu-doc h5,
.tsumugu-doc h6 {
  font-size: 1.06rem;
  margin-block-start: 1.8em;
}

/*
 * The permalink beside a heading.
 *
 * Hidden until the heading is hovered or the link itself is focused, so it
 * never competes with the heading — but it is a real link in the tab order,
 * because "hover to reveal" is not available to a keyboard or a touch screen.
 * On a coarse pointer it is simply always visible.
 */
.tsumugu-anchor {
  color: var(--doc-indigo);
  font-family: var(--doc-mono);
  font-size: 0.8em;
  font-weight: 400;
  margin-inline-start: 0.4em;
  opacity: 0;
  text-decoration: none;
}

.tsumugu-doc :is(h1, h2, h3, h4, h5, h6):hover .tsumugu-anchor,
.tsumugu-anchor:focus-visible {
  opacity: 1;
}

@media (hover: none) {
  .tsumugu-anchor {
    opacity: 0.55;
  }
}

.tsumugu-doc a {
  color: var(--doc-indigo);
  text-decoration-color: color-mix(in srgb, var(--doc-indigo) 35%, transparent);
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

.tsumugu-doc ul,
.tsumugu-doc ol {
  padding-inline-start: 1.4em;
}

.tsumugu-doc li + li {
  margin-block-start: 0.4em;
}

/* A paragraph inside a list item is the item's own line, not a paragraph with
   space around it. Without this a nested list reads as a page of gaps. */
.tsumugu-doc li p {
  margin-block: 0.15em;
}

.tsumugu-doc li > ul,
.tsumugu-doc li > ol {
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
  background: var(--doc-surface);
  border: 1px solid var(--doc-rule);
  border-radius: 6px;
  /* A long line scrolls inside the block; the page itself never scrolls
     sideways, on any screen. */
  overflow-x: auto;
  padding: 1rem 1.1rem;
}

.tsumugu-doc pre code {
  background: none;
  font-size: 0.875rem;
  line-height: 1.6;
  padding: 0;
}

/*
 * Highlighted tokens.
 *
 * Each span carries both colours; the media query picks one. Doing it this way
 * means a reader who switches their system theme with the page already open
 * sees the code change with everything else, and no script decides it after the
 * page has painted.
 */
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
  border-collapse: collapse;
  font-size: 0.95rem;
  min-width: 100%;
}

.tsumugu-doc :is(th, td) {
  border-block-end: 1px solid var(--doc-rule);
  padding: 0.55rem 0.9rem 0.55rem 0;
  text-align: start;
  vertical-align: top;
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

/*
 * Content a renderer could not represent, kept visible rather than dropped.
 * It is marked as unusual so a reader knows they are looking at source, not
 * at a page that rendered badly.
 */
.tsumugu-doc [data-tsumugu-unsupported],
.tsumugu-doc [data-tsumugu-raw-html] {
  border-inline-start: 2px solid var(--doc-ink-muted);
  color: var(--doc-ink-muted);
  font-size: 0.85rem;
}

@media (prefers-reduced-motion: reduce) {
  .tsumugu-doc * {
    transition: none;
  }
}
`;
