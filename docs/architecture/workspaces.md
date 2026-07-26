# Workspace Layout and Dependency Direction

## Status

This document describes the repository as it exists today. Tsumugu is pre-alpha
and the document pipeline in
[`docs/architecture/overview.md`](./overview.md) is not implemented yet, so the
workspace graph is deliberately smaller than the component list in that
document.

Workspaces are added when a boundary has been demonstrated by working software,
not in anticipation of one. Creating a workspace for every conceptual component
before the first vertical slice would fix boundaries that the implementation has
not yet validated.

## Layout

```text
tsumugu/
├── packages/          publishable-intent packages
│   ├── core/          @tsumugu/core
│   └── cli/           @tsumugu/cli
├── internal/          internal-only workspaces, never published
│   └── tsconfig/      @tsumugu/internal-tsconfig
└── tests/             repository-level tests
```

`pnpm-workspace.yaml` maps exactly to those two roots: `packages/*` and
`internal/*`.

## Dependency direction

Dependencies point towards core. Core never points back.

```text
@tsumugu/cli
     │
     ▼
@tsumugu/core
```

The rules the repository commits to, taken from
[`docs/architecture/overview.md`](./overview.md) and
[`docs/principles.md`](../principles.md):

- `@tsumugu/core` must not depend on the CLI, themes, renderers, the build
  adapter, search, or AI packages. Those are consumers of core, not parts of it.
- The CLI composes public packages. Nothing depends on the CLI.
- Workspace dependency cycles are forbidden.
- Internal workspaces may be used as development tooling, but a publishable
  package must never require one at runtime. An internal workspace is never
  published, so a runtime dependency on it would break every consumer.
- Workspace-to-workspace dependencies use the `workspace:` protocol.

Future renderer and theme packages will be added under `packages/` when the
vertical slice in Milestone 1 requires them.

## What enforces these rules

[`tests/workspace.test.ts`](../../tests/workspace.test.ts) reads every package
manifest and fails with the offending workspace and the violated rule. It checks
the manifest level, which is where a mistake becomes permanent: once a package
is published, a dependency edge cannot be withdrawn without a breaking change.

Import-level enforcement inside source files — deep imports into another
package's private source tree, and re-export of internal-only symbols — is not
implemented yet and is tracked in issue #6.

## Publication policy

Every workspace, including the two under `packages/`, is currently marked
`"private": true`. Nothing is published to npm during pre-alpha. Release and
versioning configuration is tracked in issue #49.

The packages under `packages/` still carry full publication metadata —
`exports`, `files`, `license`, `repository`, `engines`, and `"type": "module"` —
so that the public surface is explicit and testable before the first release
rather than assembled at release time.

The `internal/` naming convention is doubly encoded: the directory and the
`@tsumugu/internal-` package-name prefix. Both are asserted by the workspace
test, so an internal workspace cannot quietly become publishable.

## Toolchain

| Tool | Version | Note |
| --- | --- | --- |
| Node.js | `>=24.0.0` | Node.js 24 "Krypton" is the Active LTS line |
| pnpm | `11.10.0` | pinned through `packageManager` |
| TypeScript | `^6.0.3` | ESM-only, strict, project references |
| Vitest | `^4.1.9` | no configuration file; the defaults are sufficient |

These are the versions the repository requires today. The full compatibility
policy — the supported operating systems, the module-format decision, the
upgrade and deprecation process, and the position on Bun and Deno — is in
[`docs/compatibility.md`](../compatibility.md), with the reasoning recorded in
[ADR 0001](../decisions/0001-runtime-and-package-compatibility.md).

TypeScript 7, the native compiler, was evaluated and not adopted for this
foundation: at the time of writing its first stable release was eighteen days
old. A compiler is the single highest-blast-radius dependency in a TypeScript
monorepo, so the mature `6.x` line was chosen instead. Adopting TypeScript 7 is
a decision worth its own evaluation once it has soaked.

### Supply-chain settings

`pnpm-workspace.yaml` sets two deliberate constraints:

- `minimumReleaseAge: 30240` (21 days) delays adoption of freshly published
  versions, so a compromised release has a window to be detected before it can
  enter the lockfile.
- `onlyBuiltDependencies: []` states explicitly that no dependency may run
  install scripts. pnpm blocks them by default; declaring the empty allowlist
  makes any future exception appear in a diff.

## Build model

TypeScript project references drive the build. The root `tsconfig.json` is a
solution file containing no sources of its own; it only orders the referenced
projects. `tsc --build` therefore resolves cross-package types and build order
without a task orchestrator.

A task orchestrator such as Turborepo is not used. With three workspaces and one
dependency edge it would add configuration and a dependency without improving
build correctness or speed. This should be revisited if the graph grows enough
that build ordering or caching becomes a real cost.

Repository-level tests under `tests/` are type-checked through
`tests/tsconfig.json`, which opts out of the composite and declaration settings
in the shared base configuration because those tests must never emit build
output.

## Commands

All commands run from the repository root.

| Command | Behaviour |
| --- | --- |
| `pnpm install` | installs the workspace, using the committed lockfile |
| `pnpm build` | `tsc --build`, emits `dist/` for each package |
| `pnpm typecheck` | builds the packages, then type-checks `tests/` |
| `pnpm test` | builds, then runs Vitest |
| `pnpm check` | type-checks and tests, the full local gate |
| `pnpm clean` | removes build output and TypeScript build info |

`pnpm test` builds first on purpose. `tests/cli.test.ts` executes the emitted
`packages/cli/dist/bin.js` in a child process, so it can only pass against real
build output. `tsc --build` is incremental, so repeat runs are cheap.

Formatting and linting commands are not part of this foundation; they are
tracked in issue #3.
