# Compatibility Policy

## Status

This policy applies to the pre-alpha implementation. It is deliberately narrow:
carrying compatibility code before users exist costs more than it protects.

Everything below describes what the repository requires and enforces **today**.
Where something is stated but not yet verified, that is said explicitly.

The decision and its alternatives are recorded in
[ADR 0001](./decisions/0001-runtime-and-package-compatibility.md).

## Node.js

| | |
| --- | --- |
| Minimum | **24.0.0** |
| Supported line | 24.x "Krypton" — the Active LTS line |
| Active LTS until | 2026-10-20 |
| End of life | 2028-04-30 |

Node.js 24 is the Active LTS line. Node.js 26 is Current and does not become LTS
until 2026-10-28, so it is not the baseline.

**Newer even-numbered lines** (26.x and later) are expected to work and are not
blocked. They are not part of the tested matrix until CI covers them.

**Odd-numbered lines** (25.x, 27.x) are short-lived Current releases that never
become LTS. Tsumugu does not test them and will not accept bug reports specific
to them. They are not blocked by `engines`, because blocking a runtime that
generally works adds friction without preventing a real failure.

**Node.js 22 and below are not supported.** Node.js 22 is in maintenance and
Node.js 20 has reached end of life.

## Module format

**Tsumugu is ESM-only.** Every package declares `"type": "module"` and ships no
CommonJS entry point.

There is no dual-package build and none is planned. A dual build doubles the
compiled surface, doubles the test matrix, and reintroduces the dual-package
hazard where a consumer can load two copies of the same module with separate
state.

CommonJS consumers are not locked out: Node.js can `require()` an ES module
graph. Verified on Node.js 26.5.0:

```console
$ node main.cjs
require(esm) works: from esm
```

If a real consumer appears that this does not cover, the decision can be
revisited with evidence. Speculative dual publishing will not be added.

## Package manager

pnpm is pinned to an exact version through the `packageManager` field in the
root `package.json`. The pinned version is currently **11.10.0**.

**Corepack is not required and must not be assumed.** Node.js's own
distribution documentation states that Corepack "is no longer distributed as of
Node.js 25.0.0". It is still present in Node.js 24, but a policy that depends on
it would break for anyone on a newer runtime.

Instead, pnpm manages itself: pnpm 10 and later read `packageManager` and switch
to the pinned version automatically. Verified in this repository — pnpm 10.33.0
switched to 11.10.0 on the first install without Corepack present.

Continuous integration must therefore install pnpm explicitly rather than
relying on a bundled Corepack. That is tracked in issue #5.

Upgrading the pinned version is a deliberate change to the root manifest. Any
new version must also satisfy the `minimumReleaseAge` constraint described in
[the workspace document](./architecture/workspaces.md).

## Operating systems

| Platform | Status |
| --- | --- |
| Linux (x64) | supported, to be covered by CI |
| macOS (arm64) | supported, currently the only platform validated |
| Windows (x64) | supported, to be covered by CI |

Tsumugu is a documentation server: it touches path normalization, file watching,
and process signals, all of which differ across these platforms. They are
treated as first-class targets rather than as ports.

**This is a commitment, not a measurement.** No continuous integration exists
yet, so all three are currently validated only by code that was written to be
portable and by unit tests covering separator handling. Cross-platform CI is
issue #5 and Windows-specific hardening is issue #72.

Behaviour is **not** guaranteed on network file systems, mobile environments, or
embedded runtimes.

## Other JavaScript runtimes

| Runtime | Status |
| --- | --- |
| Bun | **not supported** |
| Deno | **not supported** |

These are not "experimental" and not "planned". They are outside the supported
set. Supporting a second runtime means independently testing file-system
watching, path handling, and HTTP behaviour on it; doing that before the Node.js
implementation is proven would weaken the implementation that actually has
users.

This may be reconsidered through an RFC once the Node.js implementation is
stable. Until an RFC is accepted, a bug that reproduces only on Bun or Deno is
out of scope.

## Upgrade and deprecation expectations

**During pre-alpha**, every value on this page may change in any release. No
compatibility guarantee is offered. Changes are recorded in the release notes.

**After the first stable release:**

- Raising the minimum Node.js major version is a breaking change and requires a
  major version bump.
- The minimum is raised when the current minimum line reaches end of life, or
  earlier if a specific capability justifies it, with the reason stated.
- Dropping a supported operating system requires an RFC.
- Development tooling — TypeScript, Vitest — may be upgraded at any time,
  because it is not part of the published surface.
- The pinned pnpm version may be raised at any time, but contributors notice it,
  so it is called out in the changelog.

## What enforces this policy

A policy that only exists in prose drifts. These are the mechanisms:

| Rule | Mechanism | Effect |
| --- | --- | --- |
| Minimum Node.js version | `engines.node` plus `engineStrict: true` | `pnpm install` exits 1 on an older runtime |
| Pinned package manager | `packageManager` | pnpm switches to the pinned version |
| ESM-only | `tests/compatibility.test.ts` | fails if a package is not `"type": "module"` or exposes a CommonJS entry point |
| Metadata matches this page | `tests/compatibility.test.ts` | fails if the manifests and this document disagree |

The CI matrix that the operating-system section describes does not exist yet.
Issue #5 must match this page when it is implemented.
