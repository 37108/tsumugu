# 6. MDX, without execution

- **Status:** Accepted
- **Date:** 2026-07-28
- **Related:** [`docs/security-model.md`](../security-model.md), [ADR 3](0003-live-reload-script-policy.md), [`docs/principles.md`](../principles.md)

## Context

MDX is where a lot of documentation already lives, so `.mdx` support is table
stakes for pointing Tsumugu at an existing directory. But MDX is not a markup
format — it is Markdown _plus a programming language_. Imports run, expressions
evaluate, components execute. Rendering MDX the way MDX intends means running
the documentation as code, and Tsumugu's security model is one sentence that
forbids exactly that: content does not execute.

The tension is real: full MDX fidelity and the trust model cannot both hold.

## Decision

`.mdx` is a first-class source format, parsed with the real MDX syntax
extensions — and **nothing in it executes**. Three kinds of node exist beyond
Markdown, and each is preserved as escaped source with a diagnostic naming this
policy:

| MDX construct       | What happens                      |
| ------------------- | --------------------------------- |
| `{expression}`      | shown as written, never evaluated |
| `<Component />`     | shown as written, never rendered  |
| `import` / `export` | shown as written, never run       |

Everything that is Markdown — which in most MDX files is almost everything —
renders identically to a `.md` file: headings, anchors, highlighting, search
entries, exports. A file's dynamic islands appear as visibly preformatted
source, which is the same lossless-and-honest treatment preserved HTML gets.

This is the treatment `docs/principles.md` demands twice over: _plain files
forever_ (the source survives, nothing is silently dropped) and the security
model (nothing an author wrote becomes running code).

## Consequences

### Positive

- An existing MDX corpus is servable today, and the common case — MDX used as
  Markdown with front matter — renders in full.
- The trust model is untouched. A malicious `.mdx` in a vendored docs tree is
  inert text here, while it is arbitrary code in any executing MDX toolchain.
- No React, no JSX runtime, no evaluation sandbox in the dependency tree.

### Negative

- A component-heavy MDX file renders as prose interrupted by source blocks.
  That is the honest rendering of content Tsumugu refuses to run, but it is
  not what the file's author saw in their previous tool.
- Anyone wanting executed MDX must pre-render it to HTML or Markdown outside
  Tsumugu and serve the output — which keeps the execution decision, and its
  trust implications, in their hands rather than ours.

### Follow-up required

- If real demand for executed components appears, the shape to consider is a
  **build-time, opt-in** renderer package that owns the sandboxing question —
  through the RFC process, since it changes the trust model.

## Alternatives considered

**Evaluating MDX at build time.** Executes third-party documentation on the
machine of whoever runs `tsumugu dev` on a checkout. Rejected on the security
model, not on difficulty.

**Refusing `.mdx` entirely.** Punishes the majority of MDX files, which use no
components at all, for a feature they never touched.

**Rendering components as empty space.** Silently lossy — the one thing the
document model promises never to be.
