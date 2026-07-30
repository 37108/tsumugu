---
title: Accessibility
order: 1
---

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

- Pages remain readable without JavaScript. Navigation, the table of contents,
  and the layout are server-rendered. Tsumugu ships two hash-allowed scripts for
  search and development live reload. Without them, the search field submits to
  a real page. See
  [ADR 3](../decisions/0003-live-reload-script-policy.md) and
  [ADR 4](../decisions/0004-client-side-search.md).
- Each page has one `header`, one `main`, one `footer`, and up to two named
  `nav` landmarks. Empty regions are omitted.
- The skip link is first in the tab order and moves focus to `main`.
- `aria-current="page"` announces the current page without relying on colour.
- The theme renders the heading level declared by the source.
- Each heading anchor has a useful name, such as "Link to Install the CLI".
- Code blocks, wide tables and drawn figures scroll inside focusable regions
  with `tabindex="0"`, while the page itself does not scroll sideways. A
  figure's region is named after the figure, so several on one page stay
  distinguishable.
- Table header cells carry `scope`.
- `:focus-visible` gives focused elements an outline and offset. No rule removes
  an outline without replacing it.
- `prefers-reduced-motion: reduce` removes the colour transitions.
- Both colour schemes follow the reader's system preference.

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
  off, nothing overlaps, and the page does not scroll sideways. Long code lines,
  wide tables and drawn figures scroll inside their own boxes.
- **Reduced motion and forced colours.** With the system setting on, nothing
  animates. In a forced-colours mode, text and focus indicators remain visible.
- **Copy a code block by keyboard.** Tab into a code block: the copy control
  becomes visible on focus, announces "Copy code", and announces "Copied" after
  activation. It only exists when the script runs, because a button that does
  nothing is worse than no button.
- **The table of contents follows the reading position.** As the page scrolls,
  the section under the reading line carries `aria-current="location"` and the
  indigo thread. Without the script, the list remains a working set of links.
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
