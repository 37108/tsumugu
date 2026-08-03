# 7. Operator opt-in trust for content

- **Status:** Accepted
- **Date:** 2026-07-29
- **Related:** [`docs/designs/security-model.md`](../designs/security-model.md), [ADR 3](0003-live-reload-script-policy.md), [ADR 6](0006-mdx-without-execution.md)

## Context

The security model's one sentence — content does not execute — makes two kinds
of documentation unservable as their authors intended:

- An HTML page whose point _is_ a script: a `<canvas>` demo, an interactive
  diagram, a live example. The element survives only as escaped source, and
  the script that would draw on it is removed.
- A component-heavy `.mdx` file. ADR 6 renders its islands as escaped source,
  which is honest, and also useless when the islands are the document.

ADR 6 anticipated this and named the shape of the answer: an opt-in path where
someone explicitly owns the execution decision. The trust table in the security
model already contains the right party: the operator, who is trusted with
everything because it is their machine and their command.

## Decision

A single flag, `--trust`, on both `tsumugu dev` and `tsumugu build`. It is the
operator declaring: _the contents of this documentation root are mine, and I
trust them as code._ Nothing is inferred; absent the flag, behavior is exactly
today's.

With `--trust`:

- **Author markup is emitted.** Nodes preserved as untrusted raw markup —
  `<canvas>`, `<svg>`, custom elements — reach the page verbatim instead of as
  escaped source.
- **Author scripts run.** `<script>` elements are preserved instead of
  removed. The CSP stays on and widens by exactly what the declaration covers:
  inline scripts are allowed by SHA-256 hash, collected during rendering, and
  `script-src 'self'` admits scripts served from inside the root. No external
  origin is ever added; a library a page needs lives in the root.
- **MDX executes, at build time, to static output.** Imports, expressions, and
  components evaluate on the operator's machine when the document renders.
  Relative imports resolve inside the root; bare specifiers resolve through
  ordinary Node resolution, because packages the operator installed are inside
  the declaration. The result is static HTML folded into the Semantic AST, so
  anchors, search, and exports see the executed document. No framework runtime
  is shipped to readers; client-side behavior belongs to author scripts.

The trust boundary table gains one row rather than losing one: the operator
may extend their own trust to the root's authors, explicitly, per invocation.

## Consequences

### Positive

- Canvas demos, interactive HTML, and component MDX work, under a declaration
  whose scope is visible in the command line that made it.
- The default is untouched. Pointing Tsumugu at a vendored or third-party tree
  without `--trust` is as inert as it was yesterday.
- The CSP remains meaningful under trust: an injected inline script still has
  no hash, and an external script still has no source expression.

### Negative

- `--trust` on the wrong root executes someone else's code, in the reader's
  browser and — through MDX — on the operator's machine. The flag's help text
  and the security model say this plainly; no heuristic softens it.
- The MDX path brings execution dependencies (a compiler, a bundler, a JSX
  runtime) into the composition. They are confined to an opt-in renderer
  package; core and the default composition do not depend on them.

### Follow-up required

- The security model's release review gains a question: did anything widen
  what `--trust` covers without widening the declaration's wording?
- ~~The decision lands in phases — the flag with verbatim markup first, then
  author scripts with the CSP widening, then MDX execution (issues #114–#116).
  Until a phase lands, the terminal notice and help text describe only what
  the flag does so far, and they widen with each phase.~~ Done: all three
  landed, so `--trust` now covers everything this record describes, and the
  notice says so.

## Alternatives considered

**Sandboxed islands.** Run author scripts and components inside sandboxed
iframes so the default trust model could stay closed. Rejected for cost and
fidelity: height negotiation, theme and search integration, and a second
delivery pipeline, to approximate what a one-word declaration by the already
trusted party expresses exactly.

**Trusting content unconditionally.** Simplest, and what most documentation
tools do. Rejected because it deletes the property the security model was
built on: that pointing Tsumugu at a tree you did not write is safe.

**Per-file opt-in via front matter.** Lets an author grant their own file
execution rights, which inverts the boundary: the author is precisely the
party the default does not trust.

**Allowing external script origins under trust.** Rejected to keep the
declaration's scope equal to the root: `--trust` names a directory, not the
network.
