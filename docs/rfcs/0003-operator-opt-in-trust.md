# RFC 3: Operator opt-in trust

- **Status:** Accepted
- **Date:** 2026-07-29
- **Related:** [ADR 6](../decisions/0006-mdx-without-execution.md), [ADR 7](../decisions/0007-operator-opt-in-trust.md), [`docs/designs/security-model.md`](../designs/security-model.md), issues #113–#116

## Problem

Two kinds of documentation cannot be served as written: an HTML page whose
point is a script — a `<canvas>` demo, an interactive diagram — and a
component-heavy `.mdx` file. Both are honest casualties of the security
model's one sentence, and their authors' alternative today is a different
tool, or pre-rendering outside Tsumugu. ADR 6 anticipated the need and asked
for an RFC before any execution path existed, because it changes the trust
model.

## Proposal

A single flag, `--trust`, on `tsumugu dev` and `tsumugu build`: the operator —
already trusted with everything — declares the root's content theirs and
executable. Off by default, never inferred, announced in the terminal.

Under the declaration: preserved raw markup is emitted verbatim; author
`<script>` elements run, allowed by per-page CSP hashes plus
`script-src 'self'`, never an external origin; and `.mdx` executes at build
time to static output through an opt-in renderer package
(`tsumugu-renderer-mdx`: MDX compiler, esbuild, Preact SSR), with imports
resolving inside the root and through ordinary Node resolution. Failures fall
back to the non-executing rendering with a diagnostic.

Deliberately not covered: sandboxed execution for untrusted roots, external
script origins, client-side hydration, and per-file trust grants.

## Fit

Leans on _accept HTML as input_ and _plain files forever_: content an author
already has starts working without rewriting. Leans on the trust table: the
party granting execution is the one the model already trusts with everything.
Strains the security model's one sentence by adding its single, explicit
exception — the strain is contained by keeping the default byte-identical and
the declaration's scope equal to the root.

## Alternatives

Recorded with reasons in ADR 7: sandboxed islands (cost and fidelity),
unconditional trust (deletes the model's core property), per-file front-matter
grants (inverts the boundary), external origins under trust (widens the
declaration beyond the root).

## Evidence

Decided by the maintainer in the design session of 2026-07-29 after a
recorded alternatives review; ADR 7 is the resulting record. Implementation is
phased over issues #114 (flag and verbatim markup), #115 (scripts and CSP),
and #116 (MDX execution), each landing with vertical-slice coverage.
