# 1. Runtime and package compatibility baseline

- **Status:** Accepted
- **Date:** 2026-07-26
- **Supersedes:** none
- **Related:** issue #2, [`docs/compatibility.md`](../compatibility.md)

## Context

Tsumugu is a documentation server. It touches the file system, HTTP networking,
path normalization, process signals, and eventually package publication. Every
one of those behaves differently across runtimes, runtime versions, module
formats, and operating systems.

Leaving the baseline implicit pushes the same unanswered question into every
later task: which Node.js version may this code assume, may it emit CommonJS,
does it have to work on Windows. The cost of answering it late is compatibility
code written defensively for users who do not exist.

Issue #1 already set `engines.node` and `packageManager` because the workspace
could not be installed reproducibly without them. This decision records the
reasoning behind those values, extends them into a full policy, and makes the
policy enforceable.

At the time of writing:

- Node.js 24 "Krypton" is the Active LTS line. Active LTS ends 2026-10-20 and
  end of life is 2028-04-30.
- Node.js 26 is Current and becomes LTS on 2026-10-28.
- Node.js 22 is in maintenance; Node.js 20 has reached end of life.
- Corepack "is no longer distributed as of Node.js 25.0.0" per Node.js's own
  distribution documentation.

## Decision

**Node.js 24.0.0 is the minimum.** The Active LTS line is the baseline, not the
Current release. Newer even-numbered lines are permitted and untested;
odd-numbered lines are untested and unsupported but not blocked.

**The repository is ESM-only.** Every package declares `"type": "module"` and
ships no CommonJS entry point. There is no dual-package build.

**pnpm is pinned to an exact version through `packageManager`, and Corepack is
not assumed.** pnpm 10 and later self-manage to the pinned version, which was
verified in this repository.

**Linux, macOS, and Windows are all supported targets.**

**Bun and Deno are not supported**, with no experimental or planned status.

**The minimum runtime is enforced at install time** via `engineStrict: true`,
and the policy is checked against the manifests by `tests/compatibility.test.ts`.

## Consequences

### Positive

- Later implementation work can assume modern Node.js APIs without feature
  detection or polyfills.
- No transpilation to older syntax and no dual-package build, so the compiled
  output stays close to the source and the test matrix stays single-width.
- A contributor on an unsupported runtime gets a clear install failure instead of
  an unrelated error later.
- The policy cannot silently drift away from the manifests, because a test
  compares them.

### Negative

- Node.js 22 users cannot run Tsumugu even though most of the code would work.
  Accepted: Node.js 22 is in maintenance, and pre-alpha is the cheapest time to
  set a narrow baseline.
- CommonJS consumers depend on `require(esm)`. That is a real constraint, but
  Node.js supports it on every version in the supported range.
- Claiming Windows support before Windows CI exists is a commitment the
  repository cannot currently verify. This is stated explicitly in
  `docs/compatibility.md` rather than presented as a tested guarantee, and is
  tracked in issues #5 and #72.

### Follow-up required

- Issue #5 must implement a CI matrix matching the operating-system section.
- Issue #72 must harden Windows path, process, and watching behaviour.

## Alternatives considered

**Node.js 22 as the minimum.** Wider reach, and it is still in maintenance.
Rejected: it buys compatibility with a line that reaches end of life before
Tsumugu is likely to reach a stable release, at the cost of constraining API
choices now.

**Node.js 26 as the minimum.** It is the newest release and becomes LTS in three
months. Rejected: it is Current today, so it would exclude every user on the
Active LTS line for a benefit that arrives on its own in October.

**Dual ESM and CommonJS packages.** Maximum consumer reach. Rejected: it doubles
the build and test surface and reintroduces the dual-package hazard, in exchange
for supporting consumers who have not been observed and who can already use
`require(esm)`.

**Relying on Corepack to enforce the package manager.** It is the mechanism the
`packageManager` field was designed for. Rejected on fact: Corepack is no longer
distributed as of Node.js 25.0.0, so the enforcement would silently disappear
for anyone on a newer runtime. pnpm's own version management covers the same
need without that dependency.

**Treating Bun and Deno as "experimental".** Friendlier wording. Rejected: an
experimental label invites bug reports and pull requests for a runtime with no
tests, which spends maintainer attention on compatibility instead of on the
document pipeline. "Not supported" is honest and reversible through an RFC.

**Leaving the minimum advisory rather than enforcing it.** Less friction for
contributors. Rejected: an unenforced minimum is discovered as a confusing
runtime error deep in a later task rather than as a clear message at install.

## Notes on this record

The ADR process, template, and decision index are issue #59. This record uses a
conventional ADR structure so that the first decision is captured while it is
fresh; it should be revisited for conformance when that process is defined.
