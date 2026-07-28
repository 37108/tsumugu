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

- [Design principles](principles.md) — the constraints every decision is measured against.
- [Architecture overview](architecture/overview.md) — the pipeline, stage by stage.
- [Composition](composition.md) — what zero configuration includes, and how to change it.
- [Roadmap](roadmap.md) — what is built, what is next, and what is deliberately absent.

## Reference

- [Semantic Document AST](architecture/semantic-ast.md) — the node set every format converges on.
- [Workspace layout](architecture/workspaces.md) — the packages and the rules between them.
- [Diagnostics](diagnostics.md) — every code the pipeline can produce.
- [Accessibility](accessibility.md) — what is guaranteed, what is measured, what is checked by hand.
- [Compatibility](compatibility.md) — supported runtimes and package formats.
- [Testing strategy](testing.md) — the layers, and which one a change belongs in.

## Decisions

Architecture Decision Records live in [`decisions/`](decisions/0001-runtime-and-package-compatibility.md)
and record what was chosen, what was rejected, and why.
