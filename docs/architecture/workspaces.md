# Workspace Layout and Dependency Direction

## Status

This document describes the repository as it exists today. Tsumugu is pre-alpha,
and the workspace graph is deliberately smaller than the component list in
[`docs/architecture/overview.md`](./overview.md): the scanner, document model,
routing, navigation, shell, serializer and server all live inside
`@tsumugu/core` until a boundary has been demonstrated by working software.

Workspaces are added when a boundary has been demonstrated by working software,
not in anticipation of one. Creating a workspace for every conceptual component
before the first vertical slice would fix boundaries that the implementation has
not yet validated.

## Layout

```text
tsumugu/
├── packages/                  publishable-intent packages
│   ├── core/                  @tsumugu/core
│   ├── cli/                   @tsumugu/cli
│   ├── renderer-markdown/     @tsumugu/renderer-markdown
│   ├── renderer-html/         @tsumugu/renderer-html
│   ├── theme-default/         @tsumugu/theme-default
│   ├── transformer-highlight/ @tsumugu/transformer-highlight
│   ├── preset/                @tsumugu/preset
│   └── build/                 @tsumugu/build
├── internal/          internal-only workspaces, never published
│   └── tsconfig/      @tsumugu/internal-tsconfig
└── tests/             repository-level tests
    └── helpers/       shared test support code, not collected as suites
```

Unit tests are colocated with the code they cover, under
`packages/*/src/**/*.test.ts`. See [`docs/testing.md`](../testing.md).

`pnpm-workspace.yaml` maps exactly to those two roots: `packages/*` and
`internal/*`.

## Dependency direction

Dependencies point towards core. Core never points back.

```text
                        @tsumugu/cli
                             │
                             ▼
                       @tsumugu/preset
                             │
   ┌───────────────┬─────────┴──────────┬────────────────────────┐
   ▼               ▼                    ▼                        ▼
renderer-markdown  renderer-html   theme-default    transformer-highlight
   └───────────────┴─────────┬──────────┴────────────────────────┘
                             ▼
                       @tsumugu/core
```

`@tsumugu/preset` is the composition root: it is the one package that decides
which renderers, which transformers and which theme an ordinary project gets.
The CLI parses a command line and prints to a terminal; core composes what it is
handed and chooses nothing. That is what keeps a different set of choices
possible without changing either of them. See
[`docs/composition.md`](../composition.md).

Each renderer holds every type of its own parser: mdast never leaves
`@tsumugu/renderer-markdown`, hast never leaves `@tsumugu/renderer-html`. Core
and themes see only the Semantic AST, so either parser can be replaced without
either of them changing — which is what makes HTML a first-class input rather
than a second format bolted on.

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

Further renderer and theme packages join `packages/` as the vertical slice in
Milestone 1 requires them.

## What enforces these rules

```bash
pnpm check:boundaries
```

Two layers, because a boundary can be broken in two different places.

**The manifests.** [`tests/workspace.test.ts`](https://github.com/37108/tsumugu/blob/main/tests/workspace.test.ts)
reads every `package.json` and checks the declared graph: privacy, explicit
`exports`, the `workspace:` protocol, the absence of cycles, and core's
forbidden targets. This is where a mistake becomes permanent — once a package is
published, a dependency edge cannot be withdrawn without a breaking change.

**The imports.** [`tests/boundaries.test.ts`](https://github.com/37108/tsumugu/blob/main/tests/boundaries.test.ts)
reads every source file, because an import can bypass the manifest entirely.
Five rules, each reported separately with the file, the line, the source and
target packages, and what was violated:

| Rule                       | Catches                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `deep-import`              | `@tsumugu/core/src/…`, a path that does not exist after publication |
| `escaping-relative-import` | `../../core/src/…`, the same thing spelled relatively               |
| `internal-dependency`      | a publishable package importing an `internal/` workspace            |
| `forbidden-edge`           | core importing the CLI, a theme, a renderer, build, search or AI    |
| `undeclared-dependency`    | an import that resolves only because pnpm installed it nearby       |

Specifiers are extracted with TypeScript's own `preProcessFile` rather than a
regular expression, so `import type`, `export … from` and dynamic `import()` are
all covered while an import-shaped string inside a comment is not.

The same file also pins the **public export surface** of each publishable
package. Adding a runtime export fails the test until the new name is listed
deliberately, which is what [`docs/principles.md`](../principles.md) means by a
public API being earned rather than accumulated.

### Type-only dependencies

A type-only import is still a dependency. `import type { Foo } from "@tsumugu/x"`
must be declared exactly like a value import, and the boundary rules treat the
two identically.

Where it may be declared depends on whether the type escapes:

- If the type appears in the package's emitted `.d.ts`, it belongs in
  `dependencies`. A consumer cannot type-check against a package it was not
  given.
- If it is used only internally and never appears in the emitted declarations,
  `devDependencies` is enough.

An `internal/` workspace may never be imported from a publishable package, not
even type-only. Its declarations do not exist for consumers at all.

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

| Tool       | Version    | Note                                        |
| ---------- | ---------- | ------------------------------------------- |
| Node.js    | `>=24.0.0` | Node.js 24 "Krypton" is the Active LTS line |
| pnpm       | `11.10.0`  | pinned through `packageManager`             |
| TypeScript | `^6.0.3`   | ESM-only, strict, project references        |
| Vitest     | `^4.1.9`   | `vitest.config.ts`; see `docs/testing.md`   |

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

Test files are excluded from the package build projects so they cannot reach
`dist/`. They are type-checked instead by `tsconfig.test.json`, a single
non-composite project covering `tests/`, the colocated tests under
`packages/*/src`, and `vitest.config.ts`. One project for all tests is simpler
than a parallel test project per package, and it cannot drift out of step with
the build projects.

That layout is also why `eslint.config.js` lists its TypeScript projects
explicitly instead of using typescript-eslint's project service: the service
resolves each file through the _nearest_ `tsconfig.json`, which for a colocated
test is the package build project that deliberately excludes it.

## Commands

All commands run from the repository root.

| Command                 | Behaviour                                             |
| ----------------------- | ----------------------------------------------------- |
| `pnpm install`          | installs the workspace, using the committed lockfile  |
| `pnpm format`           | formats every supported file with Prettier            |
| `pnpm format:check`     | reports unformatted files without changing them       |
| `pnpm lint`             | runs type-aware ESLint over the workspace             |
| `pnpm lint:fix`         | applies the fixes ESLint can make safely              |
| `pnpm build`            | `tsc --build`, emits `dist/` for each package         |
| `pnpm typecheck`        | builds the packages, then type-checks `tests/`        |
| `pnpm test`             | builds, then runs Vitest                              |
| `pnpm test:watch`       | re-runs affected tests as files change                |
| `pnpm test:coverage`    | builds, then runs the suite with coverage             |
| `pnpm check:boundaries` | builds, then checks the dependency and export rules   |
| `pnpm check`            | formatting, linting, types and tests — the local gate |
| `pnpm clean`            | removes build output and TypeScript build info        |

`pnpm test` builds first on purpose. `tests/cli.test.ts` executes the emitted
`packages/cli/dist/bin.js` in a child process, so it can only pass against real
build output. `tsc --build` is incremental, so repeat runs are cheap.

`pnpm check` composes only non-mutating steps, so it is safe to run before
committing and is the command CI should use.

Each package also exposes `build`, `typecheck` and `lint`. At package level
`typecheck` runs `tsc --build`, which is the same command as `build`: with
project references, type checking and emit are a single pass, and
`tsc --build --noEmit` is rejected outright because a referenced project may not
disable emit.

## Code quality tooling

Prettier formats. ESLint checks correctness. The split is strict, and it is what
keeps the two tools from fighting.

| Tool         | Owns                                                         | Configuration                           |
| ------------ | ------------------------------------------------------------ | --------------------------------------- |
| Prettier     | all formatting: TypeScript, JavaScript, JSON, Markdown, YAML | `prettier.config.js`, `.prettierignore` |
| ESLint       | correctness only, with type information                      | `eslint.config.js`                      |
| EditorConfig | editor defaults before any tool runs                         | `.editorconfig`                         |

`eslint-config-prettier` is deliberately **not** a dependency. ESLint's
formatting rules are no longer part of the recommended sets, and no stylistic
rule is enabled here, so there is no overlap to disable.

ESLint uses `recommendedTypeChecked` from typescript-eslint. The problems worth
catching in this codebase — floating promises, misused promises, unsafe `any`
flow — are invisible without type information, so the non-type-checked preset
would not be enough. Import ordering is **not** enforced: it is a stylistic
concern that Prettier does not touch, and adding a plugin for it would spend a
dependency on diff aesthetics rather than correctness. Unused code is caught
twice over, by `noUnusedLocals`/`noUnusedParameters` in TypeScript and by
`@typescript-eslint/no-unused-vars`.

Biome was evaluated as a single-tool replacement for both. It was rejected on a
measured fact rather than a preference: version 2.5.2 does not format Markdown
or YAML, reporting "No files were processed" for both. Tsumugu is a
documentation project whose repository is mostly Markdown, so a formatter that
cannot format Markdown does not cover the repository. Its `noFloatingPromises`
rule is also still in the nursery group. Pairing Biome with Prettier would mean
running two formatting systems, which is worse than running one.
