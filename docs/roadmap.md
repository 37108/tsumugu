# Roadmap

Tsumugu's roadmap is organized around hypotheses, not feature accumulation. Each milestone should validate an architectural claim with working software before the project expands its public surface.

## Milestone 0 — Repository Foundation

### Hypothesis

A clear technical constitution, contribution model, and package-boundary policy will let the project evolve quickly without turning early implementation details into accidental public commitments.

### Outcomes

- repository policies and governance;
- design principles and architecture overview;
- ADR and RFC processes;
- issue and pull request templates;
- TypeScript monorepo tooling;
- CI, tests, linting, formatting, and release scaffolding.

### Explicitly deferred

- stable public APIs;
- static build;
- search and AI packages;
- additional source formats;
- a general plugin runtime.

## Status

Milestones 0 through 5 are implemented on `main`, and milestone 6 is largely
in place: `tsumugu dev` and `tsumugu build` run the full pipeline — navigation,
anchors, highlighting, search, machine-readable outputs, watch mode with live
reload — through the official preset, with release automation configured and
awaiting the first publish. Configuration discovery became a decision instead
of a feature ([ADR 5](decisions/0005-no-configuration-file.md)).

The issue tracker is the backlog, and this file is its map: work is sequenced
by these milestones, and an issue outside them belongs to "Later, only after
evidence" until working software argues otherwise. Of the "later" list below,
the OpenAPI and Mermaid renderers now have draft RFCs
([1](rfcs/0001-openapi-renderer.md), [2](rfcs/0002-mermaid-renderer.md))
recording what evidence would move them.

## Milestone 1 — Thin Vertical Slice

### Hypothesis

One Markdown file can flow through a small Document model, minimal Semantic AST, default theme, Virtual Tree, serializer, and HTTP server without requiring a large framework or premature extension API.

### Target flow

```text
docs/index.md
    ↓
Document
    ↓
minimal Semantic AST
    ↓
default theme
    ↓
Virtual Tree
    ↓
HTML
    ↓
HTTP response
```

### Success criteria

- one Markdown page is visible in a browser;
- the implementation is testable by stage;
- generated HTML is escaped and accessible;
- no public AST or hook API is required;
- package responsibilities remain clear.

## Milestone 2 — Document Pipeline

### Hypothesis

A normalized Document and shared Semantic AST can represent the common semantics of Markdown and HTML without becoming a browser DOM clone or losing unsupported HTML silently.

### Outcomes

- internal DocumentRecord;
- source identity and route rules;
- metadata resolution;
- diagnostics;
- Semantic AST v0;
- Markdown renderer;
- HTML document and fragment renderer;
- preserved-HTML strategy;
- transformer ordering.

## Milestone 3 — File-System Documentation Server

### Hypothesis

Predictable file-system routing, generated navigation, a generated landing page, and actionable diagnostics are sufficient to make an ordinary directory feel like a coherent documentation project.

### Outcomes

- nested route lookup;
- homepage resolution;
- route-collision diagnostics;
- generated landing page;
- 404 handling;
- static assets;
- localhost-first HTTP server;
- security headers and traversal protection.

## Milestone 4 — Incremental Development Experience

### Hypothesis

A coarse DocumentChange model and targeted cache invalidation can provide immediate editing feedback without a complex reactive runtime.

### Outcomes

- file add, change, and removal events;
- `mtime + size` fast path;
- conditional hashing;
- targeted invalidation;
- browser live reload;
- edit-to-refresh benchmarks;
- large fixture projects.

## Milestone 5 — CLI and Zero-Config Preset

### Hypothesis

The CLI can provide excellent zero-config defaults while the underlying library remains explicitly composable.

### Outcomes

- `tsumugu dev`;
- default `./docs` root;
- host and port options;
- optional configuration discovery;
- official Markdown, HTML, transformer, theme, and serializer preset;
- friendly startup and error output;
- end-to-end CLI tests.

## Milestone 6 — Stabilization and First Pre-alpha Release

### Hypothesis

Official packages and representative projects can validate boundaries before any significant API is promoted to stable public status.

### Outcomes

- cross-platform CI;
- security review;
- benchmark baseline;
- package exports review;
- internal-public boundary verification;
- examples and contributor architecture tour;
- changeset and release process;
- documented limitations;
- pre-alpha release checklist.

## Later, only after evidence

The following are intentionally not part of the initial implementation plan:

- `@tsumugu/build`;
- `@tsumugu/search`;
- `@tsumugu/ai`;
- OpenAPI and Mermaid renderers;
- multiple official themes;
- sandboxed interactive documents;
- stable third-party extension APIs.

They should be proposed when the core pipeline has demonstrated a real integration point and package ownership is clear.
