# 9. Diagrams are drawn at build time, by Tsumugu

- **Status:** Accepted
- **Date:** 2026-07-30
- **Related:** [RFC 2](../rfcs/0002-mermaid-renderer.md), [ADR 3](0003-live-reload-script-policy.md), [ADR 4](0004-client-side-search.md), [ADR 7](0007-operator-opt-in-trust.md)

## Context

A fenced block tagged `mermaid` is how diagrams live in Markdown. Tsumugu showed
it as code: the source survived, no diagram appeared.

RFC 2 named the blocker and left it open — Mermaid's own renderer needs a DOM,
so running it on the server means a headless browser or a heavyweight DOM
emulation. Shipping Mermaid to the browser instead was never available: it is
megabytes of third-party JavaScript executing documentation content, against
both script ADRs at once.

The RFC asked for evidence. Measured with Mermaid 11.16 under jsdom, on the
diagram kinds documentation actually contains:

| Diagram           | Result                                                            |
| ----------------- | ----------------------------------------------------------------- |
| `sequenceDiagram` | Correct SVG, 450×226, no `foreignObject`, 9–25 ms                 |
| `graph LR`        | `foreignObject`, computed width 41216px for a five-node flowchart |
| `stateDiagram-v2` | Same                                                              |
| Install cost      | 83 MB Mermaid + 8.3 MB jsdom, 177 MB resolved                     |

Two independent failures. Mermaid lays flowchart labels out as HTML inside a
`foreignObject`, which no browser renders inside `<img>`; and its layout asks
the DOM to measure text, which jsdom cannot do, so a text-metrics shim only
moves the error around. `flowchart.htmlLabels: false`, a top-level equivalent,
and an in-document `%%{init}%%` directive all left `foreignObject` in place.

So the honest reading of the evidence is that Mermaid under jsdom draws the
diagram kind nobody writes and loses the one everybody writes.

## Decision

Tsumugu draws the diagram itself, at build time, with no dependency and no
browser: `tsumugu-transformer-mermaid` parses a documented subset of Mermaid's
syntax, lays it out, and emits SVG.

- **The subset is flowcharts (`graph`/`flowchart` with `TD`, `TB`, `LR`, `RL`,
  `BT`) and `sequenceDiagram`.** Anything else — class, state, gantt, pie, ER,
  journey — stays a code block and reports a warning naming what was not drawn.
  A diagram Tsumugu cannot draw must never cost the reader the page.
- **The AST gains a `diagram` node** carrying the SVG, a title, a description
  and the original source. Geometry stays out of the Semantic AST: the node
  carries the finished figure, not coordinates, so themes never learn layout.
- **The theme emits it inline**, through the existing `trustedHtml` hatch with a
  stated reason. Inline rather than `<img>` so the figure inherits
  `currentColor` and follows the reader's light or dark theme, and so its text
  stays selectable and searchable.
- **The figure is named by `role="img"` and an `aria-label`, and described by a
  visually hidden `figcaption`** — not by SVG's own `<title>` and `<desc>`. The
  serializer treats `title` as a raw-text element, where escaping would corrupt
  the content and not escaping would let it close the element, so it refuses
  text there and cannot tell HTML's `title` from SVG's. Rather than teach the
  last safe place in the pipeline about namespaces, the accessible name and
  description are ordinary HTML that the serializer escapes like anything else.
  The description is hidden because most are generated: prose under every figure
  restating what the figure shows is noise for a reader who can see it, and the
  whole point of it for a reader who cannot.
- **`accTitle` and `accDescr` are honored** when the author wrote them; when
  they did not, the description is generated from the diagram's own contents.
  A diagram without a description is not shippable, and demanding one from
  every existing Mermaid block would greet an ordinary paste with a warning.
- **The source stays in the node**, so search, `documents.json` and `llms.txt`
  still see the diagram as text. A reader who cannot see the figure and a model
  reading the corpus get the same thing.

The `diagram` node's trust status is not the operator's declaration and does not
widen ADR 7. The SVG never came from content: content supplied text, and
Tsumugu's own code produced the markup, exactly as a theme does.

## Consequences

### Positive

- `npx tsumugu dev docs` draws diagrams with no flag, no install, and no
  network. The transformer adds no dependency to any project.
- Output is deterministic, which incremental rebuilds and caching require and a
  browser-based renderer would have made a promise Tsumugu could not keep.
- Diagrams follow the theme, scale with the page, and are searchable.

### Negative

- **Tsumugu is not Mermaid.** Syntax outside the subset degrades to a code
  block, and a diagram that renders on GitHub may not render here. The subset
  is documented in the usage guide, and the diagnostic names the construct.
- Layout is Tsumugu's, so a diagram will not look identical to Mermaid's
  rendering of the same source.
- Every construct added to the subset later is layout code the project owns.

### Follow-up required

- The usage guide states the supported subset, in both languages, next to the
  syntax it supports.
- RFC 2's status becomes accepted-with-a-different-shape, pointing here.

## Alternatives considered

**Mermaid plus jsdom, in an opt-in package.** The RFC's own preferred shape, and
the first choice made in this design session. Rejected on the measurements
above: flowcharts and state diagrams cannot be delivered at all.

**Mermaid plus a headless browser.** Full fidelity, and the only path that
draws every diagram kind correctly. Rejected on weight and reliability: a
browser download per install, and the first Tsumugu feature that fails
depending on what is available beside it.

**Mermaid in the browser.** Rejected by ADR 3 and ADR 4 before it was proposed;
it also breaks on strict-CSP hosts, which is where static output goes.

**A data-URI `<img>` instead of inline SVG.** No AST change and no trust hatch,
and it was the first shape considered. Rejected because the colors bake in — a
figure that cannot follow the reader's theme, whose text cannot be selected or
searched, and whose only accessible name is an `alt` attribute.

**Geometry in the AST, drawn by the theme.** Keeps the trust hatch out. Rejected
because the Semantic AST describes what a document means and never how it is
laid out; coordinates are the clearest possible violation of that line, and
every theme would owe a drawing implementation.
