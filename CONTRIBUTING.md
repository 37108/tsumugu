# Contributing to Tsumugu

Thank you for considering a contribution to Tsumugu.

Tsumugu is intentionally conservative about architecture and public APIs. The project values working vertical slices, explicit boundaries, measurable behavior, and plain-file portability over speculative abstraction.

## Before contributing

Please read:

- `README.md`
- `docs/principles.md`
- `docs/architecture/overview.md`
- `docs/architecture/workspaces.md`
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

| Command | Behaviour |
| --- | --- |
| `pnpm build` | compiles every package to `dist/` |
| `pnpm typecheck` | builds the packages, then type-checks `tests/` |
| `pnpm test` | builds, then runs the test suite |
| `pnpm check` | type-checks and tests, the full local gate |
| `pnpm clean` | removes build output |

`docs/architecture/workspaces.md` describes the workspace layout, the allowed
dependency direction, and the toolchain versions.

Formatting and linting are not configured yet; they are tracked in issue #3.

## Contribution workflow

1. Search existing issues and discussions before proposing new work.
2. Open or select an issue with a clear problem statement and acceptance criteria.
3. Keep each pull request focused on one coherent change.
4. Add or update tests for behavioral changes.
5. Update documentation when behavior, architecture, or user-facing expectations change.
6. Add a changeset when the change affects a publishable package.

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
