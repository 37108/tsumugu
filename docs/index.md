---
title: Tsumugu
description: A zero-config documentation server for plain Markdown and HTML files.
---

# Tsumugu

Tsumugu turns a directory of Markdown and HTML files into a documentation site,
with no configuration file and no build step. This documentation is served by
Tsumugu itself: run `pnpm docs` in a checkout and you are reading the same
pipeline the project ships.

The project is **experimental and pre-alpha**. Nothing here is a stable API.

## Start here

- [Using Tsumugu](usage.md) — install, write, serve, ship: the workflow on one page. [日本語版](ja/usage.md)もあります。
- [Design principles](principles.md) — the constraints every decision is measured against.
- [Architecture overview](architecture/overview.md) — the pipeline, stage by stage.
- [Composition](composition.md) — what zero configuration includes, and how to change it.
- [Development mode](development-mode.md) — watching, reloading, and what happens when a save is wrong.
- [Roadmap](roadmap.md) — what is built, what is next, and what is deliberately absent.

## Reference

- [Semantic Document AST](architecture/semantic-ast.md) — the node set every format converges on.
- [Workspace layout](architecture/workspaces.md) — the packages and the rules between them.
- [Machine-readable outputs](machine-readable.md) — the corpus, `llms.txt` and the sitemap.
- [Diagnostics](diagnostics.md) — every code the pipeline can produce.
- [Accessibility](accessibility.md) — what is guaranteed, what is measured, what is checked by hand.
- [Security model](security-model.md) — what is trusted, what is refused, and the pre-release review.
- [Compatibility](compatibility.md) — supported runtimes and package formats.
- [Performance](performance.md) — what it costs, and what keeps rebuilds cheap.
- [Releasing](releasing.md) — versioning, publishing, and what pre-alpha means.
- [Testing strategy](testing.md) — the layers, and which one a change belongs in.

## Decisions and proposals

[Architecture Decision Records](decisions/README.md) record what was chosen and
why; [RFCs](rfcs/README.md) propose what has not been decided yet. Both keep
their rejected alternatives, which are half the value.
