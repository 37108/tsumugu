# RFC 2: Mermaid diagrams

- **Status:** Draft — awaiting a server-side rendering path that fits the model
- **Date:** 2026-07-28
- **Related:** issue #58, [ADR 3](../decisions/0003-live-reload-script-policy.md), [ADR 4](../decisions/0004-client-side-search.md)

## Problem

Mermaid is how diagrams live in Markdown today: a fenced block with
`language: mermaid`, readable as text, versioned with the prose. Tsumugu
currently shows that block as code — lossless, but not a diagram.

## Proposal

A **transformer**, `@tsumugu/transformer-mermaid`, that rewrites
`code-block[language=mermaid]` nodes into an SVG carried by the AST — rendered
at build time, on the server, so the reader receives an image and no script.

The blocker is the rendering path, and it is why this is a draft rather than a
plan. Mermaid's renderer needs a DOM; running it server-side means a headless
browser or a heavyweight DOM emulation, either of which would be Tsumugu's
largest dependency by an order of magnitude, pulled in by every project whether
or not it draws diagrams.

What would _not_ be acceptable is the easy route: shipping Mermaid's own bundle
to the browser. That is megabytes of third-party JavaScript executing
documentation content, against both script ADRs at once.

## Fit

The transformer boundary fits perfectly — this is precisely the "annotate the
AST, let the theme present it" shape syntax highlighting already has. The
dependency cost is the entire tension.

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
