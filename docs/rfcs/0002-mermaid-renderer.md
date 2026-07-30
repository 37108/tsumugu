# RFC 2: Mermaid diagrams

- **Status:** Accepted, in a different shape — see [ADR 9](../decisions/0009-diagrams-drawn-at-build-time.md)
- **Date:** 2026-07-28
- **Related:** issue #58, [ADR 3](../decisions/0003-live-reload-script-policy.md), [ADR 4](../decisions/0004-client-side-search.md), [ADR 9](../decisions/0009-diagrams-drawn-at-build-time.md)

## What happened

The evidence this RFC asked for was gathered, and it ruled out the shape the
RFC proposed. Mermaid under jsdom draws sequence diagrams correctly and cannot
draw flowcharts at all: their labels land in a `foreignObject`, and the layout
asks the DOM to measure text, which produced a 41216px width for a five-node
graph. The sibling-package idea below was the right instinct about _weight_ and
the wrong one about _feasibility_.

So Tsumugu draws a documented subset itself, at build time, with no dependency.
ADR 9 records the measurements, the decision and its cost — chiefly that Tsumugu
is not Mermaid, and syntax outside the subset stays a code block. The rest of
this RFC is left as it was written.

## Problem

Mermaid is how diagrams live in Markdown today: a fenced block with
`language: mermaid`, readable as text, versioned with the prose. Tsumugu
currently shows that block as code. The source is preserved, but no diagram is
drawn.

## Proposal

A **transformer**, `tsumugu-transformer-mermaid`, that rewrites
`code-block[language=mermaid]` nodes into an SVG carried by the AST. Rendering
happens on the server at build time, so the reader receives an image and no
script.

The blocker is the rendering path, and it is why this is a draft rather than a
plan. Mermaid's renderer needs a DOM; running it server-side means a headless
browser or a heavyweight DOM emulation, either of which would be Tsumugu's
largest dependency by an order of magnitude, pulled in by every project whether
or not it draws diagrams.

What would _not_ be acceptable is the easy route: shipping Mermaid's own bundle
to the browser. That is megabytes of third-party JavaScript executing
documentation content, against both script ADRs at once.

## Fit

The transformer boundary matches the shape used by syntax highlighting: it
annotates the AST and lets the theme present the result. The unresolved problem
is the dependency cost.

## Alternatives

**Client-side Mermaid.** Rejected above; it is also the approach that breaks in
static output with strict CSP hosts.

**Requiring a separate CLI (`mmdc`) on PATH.** Honest about the cost, but the
first Tsumugu feature that fails depending on what is installed beside it.

**A sibling package that owns the headless renderer**, opt-in per project, so
the weight is paid only where diagrams are drawn. This is the most likely
acceptable shape.

## Evidence

Needed: a measurement of the opt-in package's install cost and render time at
documentation scale, and one project that wants it enough to carry that cost.
