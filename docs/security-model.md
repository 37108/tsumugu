---
description: What Tsumugu trusts, what it refuses, and the review to repeat before each release.
---

# Security model

`SECURITY.md` at the repository root says how to report a vulnerability. This
page says what would count as one: the boundaries Tsumugu promises, reviewed
against the implementation before the first pre-alpha release.

## Trust boundaries

Three parties, three levels of trust:

| Party                        | Trusted with                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| the person running `tsumugu` | everything — it is their machine and their command                                   |
| the documentation's authors  | content, not code: their words are served, their markup and scripts are not executed |
| whoever can reach the port   | nothing                                                                              |

The interesting boundary is the middle one. Documentation often arrives from
many hands — contributors, vendored files, generated output — and a
documentation tool that runs its content turns every writer into a code owner.
So: **content does not execute**, and the mechanisms below are all enforcement
of that one sentence.

## What enforces it

Each claim names its test, because a security property without a test is a
security opinion.

- **Author markup is never emitted.** HTML sources are parsed to the Semantic
  AST; markup with no semantic equivalent is preserved as _escaped text_, and
  `<script>` content is removed with a diagnostic. The serializer's only path
  to raw output is `trustedHtml`, which requires a written reason, and the
  themes use it for exactly two things: Tsumugu's own stylesheets and Tsumugu's
  own scripts. (`packages/core/src/theme/serialize.test.ts`,
  `packages/renderer-html/src/index.test.ts`)
- **The browser is told the same thing.** Every response carries
  `Content-Security-Policy: default-src 'none'` with `script-src` naming two
  SHA-256 hashes: the page client and, in development, live reload. An
  author's script and an injected one are refused by the browser even if every
  server-side layer failed. ADRs 3 and 4 record the two exceptions and their
  boundaries. (`tests/vertical-slice.test.ts`)
- **Requests cannot leave the root.** Routes are branded types whose
  constructors reject traversal, request paths are decoded _before_ validation
  so `%2e%2e%2f` cannot hide, and assets are resolved through `realpath` and
  compared against the resolved root — so a symlink pointing outside is
  refused by where it points, not how it is spelled. Dotfiles are refused
  outright, which keeps `.env` and `.git` unreachable by default.
  (`packages/core/src/document/paths.test.ts`,
  `packages/core/src/server/assets.test.ts`)
- **The server binds loopback** unless told otherwise, so a documentation
  server started in a coffee shop is not reachable by the coffee shop.
  (`packages/core/src/server/serve.test.ts`)
- **Errors do not leak the machine.** A failure mid-response becomes a page
  that says the server failed; the stack trace, with its absolute paths, goes
  to the terminal. 404s list routes, never files. The 400 page does not echo
  the undecodable input back. (`packages/core/src/server/serve.test.ts`,
  `packages/core/src/pipeline/generated.test.ts`)
- **The supply chain is slowed and pinned.** Dependencies wait 21 days before
  installation (`minimumReleaseAge`), CI actions are pinned to commit SHAs, CI
  needs no secrets, and publishing uses short-lived trusted-publishing
  credentials — there is no long-lived npm token to steal.
  (`tests/workflows.test.ts`)

## What is out of scope

Named so nobody mistakes silence for coverage:

- **Denial of service.** A development server on loopback has one user; rate
  limiting it would be theatre. A published static build's availability belongs
  to its host.
- **Secrets inside the documentation root.** Tsumugu refuses dotfiles, but a
  root containing `credentials.txt` will serve it: files beside documents are
  assets by design. The root is a publication boundary; treat it as one.
- **TLS.** Development is loopback; production is a static host that
  terminates TLS itself.
- **Confidentiality between readers.** Every route is public to whoever can
  reach the port. `hidden` is unlisted, not access control, and the
  documentation says so wherever it appears.

## The review to repeat

Before each release, walk this list against the diff since the last one:

1. Does anything new call `trustedHtml`? Each call site is a decision; the
   reason string should still be true.
2. Did the CSP change? Any new source expression needs the ADR treatment.
3. Did anything new read the file system from a request? It must resolve
   through the asset layer or the routing types, never through a joined path.
4. Do the diagnostics or error pages include any new interpolated value that a
   client controls?
5. Did a dependency arrive? CONTRIBUTING.md's justification list applies, and
   `pnpm audit` should be quiet.

The first pass of this review — 2026-07-28, covering everything up to the
static build — found one deviation worth recording: the sitemap placeholder
origin (`example.invalid`) is emitted into build output when no origin is
given. It is accompanied by a diagnostic and is deliberate; an origin invented
silently would be worse.
