# Contributing to Tsumugu

Thank you for considering a contribution to Tsumugu.

Tsumugu is intentionally conservative about architecture and public APIs. The project values working vertical slices, explicit boundaries, measurable behavior, and plain-file portability over speculative abstraction.

## Before contributing

Please read:

- `README.md`
- `docs/principles.md`
- `docs/architecture/overview.md`
- `docs/architecture/workspaces.md`
- `docs/compatibility.md`
- `docs/testing.md`
- `docs/diagnostics.md`
- `docs/accessibility.md`
- `docs/composition.md`
- `docs/machine-readable.md`
- `docs/releasing.md`
- `docs/development-mode.md`
- `docs/performance.md`
- `docs/security-model.md`
- the relevant Architecture Decision Records in `docs/decisions/`

## Development status

Tsumugu is currently experimental and pre-alpha. Internal APIs may change freely. No API should be treated as stable unless it is explicitly documented as public and stable.

## Local development

Tsumugu is a pnpm workspace. Node.js 24 or newer is required; pnpm is pinned
through the `packageManager` field, so a recent pnpm will switch to the correct
version automatically.

```bash
pnpm install
pnpm check
```

| Command                 | Behaviour                                                              |
| ----------------------- | ---------------------------------------------------------------------- |
| `pnpm format`           | formats every supported file with Prettier                             |
| `pnpm format:check`     | reports unformatted files without changing them                        |
| `pnpm lint`             | runs type-aware ESLint over the workspace                              |
| `pnpm lint:fix`         | applies the fixes ESLint can make safely                               |
| `pnpm build`            | compiles every package to `dist/`                                      |
| `pnpm typecheck`        | builds the packages, then type-checks `tests/`                         |
| `pnpm test`             | builds, then runs the test suite                                       |
| `pnpm test:watch`       | re-runs affected tests as files change                                 |
| `pnpm test:coverage`    | builds, then runs the suite with coverage                              |
| `pnpm check:boundaries` | checks the dependency direction and export surface                     |
| `pnpm check`            | formatting, linting, types and tests — the local gate                  |
| `pnpm docs`             | builds, then serves this repository's own `docs/`                      |
| `pnpm bench`            | measures build and rebuild cost on a generated site                    |
| `pnpm styles`           | recompiles the shell and theme stylesheets from their Tailwind sources |
| `pnpm clean`            | removes build output                                                   |

`pnpm docs` serves the documentation you are reading through Tsumugu itself, on
localhost, with watch mode on: edit a file under `docs/` and the open page
reloads. It is the fastest way to see what a change to the pipeline does to a
real project, and `tests/self-hosting.test.ts` runs the same thing in CI —
a broken link or an untitled page in `docs/` fails the suite.

`pnpm check` never modifies files: it uses `format:check` rather than `format`,
so it can be run safely before committing and in CI. Use `pnpm format` and
`pnpm lint:fix` to apply changes.

The shell's and the default theme's stylesheets are authored in Tailwind's
vocabulary (`shell.css`, `theme.css`) and compiled by `pnpm styles` into the
TypeScript constants that ship — the output is still one inline stylesheet per
owner, so the content-security policy and the zero-runtime-dependency rule are
untouched. Edit the CSS, never the generated file; `tests/styles.test.ts`
fails when the two drift.

Prettier owns formatting and ESLint owns correctness. There is deliberately no
overlap between them, so no rule needs to be disabled to keep the peace. Do not
add stylistic lint rules.

Individual packages expose `build`, `typecheck` and `lint`, so a single package
can be checked with `pnpm --filter tsumugu-core run lint`.

`docs/architecture/workspaces.md` describes the workspace layout, the allowed
dependency direction, and the toolchain versions. `docs/testing.md` describes
the test layers, where each kind of test belongs, and the file-system helpers.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`.
It runs the same commands documented above, one per step, so a failed run names
the command that failed. Linux runs every gate; macOS and Windows run the build
and tests, which are the parts that can behave differently per platform.

If `pnpm check` passes locally, CI should agree. When it does not, the
difference is almost always a path assumption or a line ending — see
`docs/testing.md`.

## Contribution workflow

1. Search existing issues and discussions before proposing new work.
2. Open or select an issue with a clear problem statement and acceptance criteria.
3. Keep each pull request focused on one coherent change.
4. Add or update tests for behavioral changes.
5. Update documentation when behavior, architecture, or user-facing expectations change.
6. Add a changeset when the change affects a publishable package: `pnpm changeset`. See [`docs/releasing.md`](docs/releasing.md).

## Design expectations

Contributions should preserve these principles:

- zero configuration for common cases;
- convention over configuration;
- the file system as the source of truth;
- plain files forever;
- HTML as a first-class input;
- small core and strong package boundaries;
- explicit composition instead of hidden discovery;
- no unrestricted lifecycle hooks;
- package-owned configuration;
- stable public APIs earned through real usage.

Before adding a new concept, configuration field, extension category, hook, or public export, explain why existing composition cannot solve the problem.

The ADR process lives in [`docs/decisions/README.md`](docs/decisions/README.md);
the RFC process in [`docs/rfcs/README.md`](docs/rfcs/README.md).

## When an RFC is required

An RFC is required for:

- a new or changed public API;
- a breaking public API change;
- a new extension category or lifecycle;
- a new core configuration field;
- publishing the Semantic AST or Virtual Tree as stable APIs;
- changing the plugin model;
- changing the security or trust model;
- changing package boundaries;
- adding a substantial feature to core;
- officially supporting a new source format.

Internal refactors, bug fixes, tests, documentation corrections, and behavior-preserving performance improvements normally do not require an RFC.

## Public API policy

Public APIs are earned, not merely designed.

The expected progression is:

```text
Idea
  ↓
Internal implementation
  ↓
Use by core or official packages
  ↓
Evidence from real usage
  ↓
RFC review
  ↓
Stable public API
```

Do not export an internal type or function solely because it may be useful later.

## Dependency policy

Every new runtime dependency should be justified in the pull request:

- the problem it solves;
- why platform APIs or an existing dependency are insufficient;
- maintenance and security status;
- runtime and dependency-graph cost;
- ESM and TypeScript support;
- how difficult replacement would be.

Parser-specific AST types must not leak into Tsumugu's public APIs.

## Definition of done

A change is complete when:

- behavior is covered by meaningful tests;
- type checking, linting, tests, and builds pass;
- documentation reflects the behavior;
- architecture boundaries remain intact;
- errors are actionable;
- security implications have been considered;
- performance claims are measured;
- no unrelated refactor is included;
- no internal package is accidentally exported.

## Review expectations

Reviews should focus on correctness, user impact, security, maintainability, architectural fit, and test quality. Be direct about technical risks while remaining respectful toward contributors.

## Generated code and filler

Do not submit large amounts of placeholder code, unused abstractions, speculative interfaces, or generated documentation that has not been reviewed for accuracy. A small working vertical slice is preferred over a broad nonfunctional skeleton.
