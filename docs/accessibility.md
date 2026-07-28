# Accessibility

## The target

Tsumugu's default output aims at **WCAG 2.2 level AA** for the pages it
generates: the application shell, the default theme's rendering of document
content, and the pages it writes itself, such as the generated landing page and
the not-found page.

Tsumugu cannot make a document accessible that is not. An image with no
alternative text, a heading level skipped by the author, a table used for
layout: those belong to the source, and Tsumugu reports what it can rather than
inventing what it cannot know.

## What is guaranteed by construction

These hold for every page, and each is enforced by a test rather than by
intention:

- **No JavaScript is required to read.** Navigation, the table of contents and
  the layout are all server-rendered. Tsumugu ships two scripts, each allowed by
  its hash: search, and live reload in the development server. Without them the
  page still reads, and the search field still submits to a real page. See
  [ADR 3](decisions/0003-live-reload-script-policy.md) and
  [ADR 4](decisions/0004-client-side-search.md).
- **Landmarks are present and named.** One `header`, one `main`, one `footer`,
  and up to two `nav` landmarks, named "Documentation" and "On this page". An
  empty region is not rendered at all: an empty navigation landmark wastes the
  time of the reader least able to skip it.
- **A skip link comes first** in the tab order and moves focus to `main`.
- **The current page is announced**, through `aria-current="page"` rather than
  through colour alone.
- **Heading levels are the document's own.** The theme renders the level the
  source declared; it never renumbers to suit a design.
- **Every heading anchor has its own name** — "Link to Install the CLI", not
  "hash".
- **Scrollable regions are focusable.** A code block and a wide table each
  scroll inside their own box, with `tabindex="0"` so a keyboard can scroll
  them, and the page itself never scrolls sideways.
- **Table header cells carry `scope`**, so a screen reader can announce the
  column a value belongs to.
- **Focus is always visible**, through `:focus-visible` with an outline in the
  accent colour and an offset. No rule removes an outline without replacing it.
- **Reduced motion is respected.** The only transitions are colour changes, and
  `prefers-reduced-motion: reduce` removes them.
- **Both colour schemes are shipped**, following the reader's system preference,
  with no control that could disagree with it.

## Colour and contrast

Measured against the backgrounds they are used on:

| Pair                      | Light   | Dark    |
| ------------------------- | ------- | ------- |
| body text on the page     | 16.46:1 | 14.37:1 |
| muted text on the page    | 6.18:1  | 7.78:1  |
| links on the page         | 9.62:1  | 9.01:1  |
| body text on a code block | 15.06:1 | 12.93:1 |
| warning label             | 5.72:1  | 9.50:1  |
| error label               | 7.40:1  | 8.55:1  |

All are above the 4.5:1 that level AA requires for body text. The figures come
from the palette constants in `packages/core/src/shell/stylesheet.ts` and
`packages/theme-default/src/stylesheet.ts`; changing a colour means measuring
again.

Syntax highlighting uses the Vitesse themes, which are built for this contrast
range, but individual token colours are not audited pair by pair: a token is
decoration over text that is already readable without it.

## What the automated checks cover

`tests/accessibility.test.ts` builds real projects, serves them, and runs
axe-core over the resulting DOM: a document page, the generated landing page, a
page carrying diagnostics, and the not-found page.

`color-contrast` is **disabled** in those runs. jsdom does not lay out or paint,
so the rule cannot produce a real answer there; the table above is the record
instead.

## What only a person can check

Run these before a release, and after any change to the shell or the theme:

- **Keyboard only.** Tab from the top of a document page. The skip link appears
  first and works. Every sidebar entry, every table-of-contents entry, every
  heading anchor and every link in the content is reachable, in an order that
  matches the visual one. Focus is visible at every stop. Nothing traps focus.
- **Screen reader.** With VoiceOver or NVDA, list the landmarks: they should be
  header, two named navigations, main, footer. List the headings: the outline
  should match the document. Read a table: column headers should be announced
  with the cells.
- **Zoom.** At 200% browser zoom, and at a 320 px viewport, no content is cut
  off, nothing overlaps, and the page does not scroll sideways. Long code lines
  and wide tables scroll inside their own boxes.
- **Reduced motion and forced colours.** With the system setting on, nothing
  animates. In a forced-colours mode, text and focus indicators remain visible.
- **Copy a code block by keyboard.** Tab into a code block: the copy control
  becomes visible on focus, announces "Copy code", and announces "Copied" after
  activation. It only exists when the script runs, because a button that does
  nothing is worse than no button.
- **The table of contents follows the reading position.** As the page scrolls,
  the section under the reading line carries `aria-current="location"` and the
  indigo thread. Without the script the list is still a working set of links —
  the marker is enhancement, not navigation.
- **Search by keyboard.** Tab to the field, type, walk the results with the
  arrow keys, follow one with Enter, dismiss with Escape. Focus stays in the
  field throughout, and the result count is announced.
- **Content that is not tidy.** A page with no headings, a page with one very
  long heading, a document with deeply nested lists, a table with many columns.

## Known limitations

Recorded rather than hidden:

- **Contrast is not verified by an automated check**, for the reason above.
- **Author content is not corrected.** A missing image alternative is reported
  only where a renderer can see it is missing; Tsumugu does not write one.
- **No screen-reader automation.** Reading order and announcement quality are
  checked by hand; automating them would test the automation.
