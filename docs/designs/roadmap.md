# Roadmap

Tsumugu develops through working vertical slices. Each milestone tests an
architectural claim before the project adds more public surface.

Milestones 0 through 5 are implemented on `main`. Milestone 6 is mostly in
place: the development server and static builder run the full pipeline, the
release workflow is configured, and the first publish is still pending.
Configuration discovery was dropped in favor of the decision recorded in
[ADR 5](../decisions/0005-no-configuration-file.md).

## Milestones

| Milestone                  | What it had to prove                                                                                         | Result                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 0. Repository foundation   | The project could evolve without turning early implementation details into public commitments.               | Governance, design records, repository tooling, CI, and release scaffolding.                                                  |
| 1. Thin vertical slice     | One Markdown file could reach a browser without a large framework or premature extension API.                | Document model, minimal AST, default theme, serializer, and HTTP server.                                                      |
| 2. Document pipeline       | Markdown and HTML could share one semantic model without copying a browser DOM or dropping unsupported HTML. | Metadata, diagnostics, Semantic AST v0, renderers, and ordered transformers.                                                  |
| 3. File-system server      | An ordinary directory could become a coherent site through predictable routes and generated navigation.      | Nested routes, home pages, collision diagnostics, assets, security headers, and traversal protection.                         |
| 4. Incremental development | Targeted invalidation could provide quick feedback without a reactive runtime.                               | File events, conditional hashing, caches, live reload, and edit-to-refresh benchmarks.                                        |
| 5. CLI and preset          | The CLI could provide useful defaults while the library remained explicitly composable.                      | `tsumugu dev`, default roots, host and port options, the official preset, and end-to-end CLI tests.                           |
| 6. First pre-alpha release | Official packages and real projects could test package boundaries before any API became stable.              | Cross-platform CI, security review, benchmark baseline, package export checks, examples, changesets, and a release checklist. |

Diagrams left this list once the evidence arrived: a prototype measured what
Mermaid does under a DOM emulation, and the answer changed the design rather
than confirming it ([ADR 9](../decisions/0009-diagrams-drawn-at-build-time.md)).

The issue tracker is the backlog. Work outside these milestones belongs in the
later list until usage or a prototype supplies evidence.

## Later, with evidence

- OpenAPI support. The draft RFC records the open questions:
  [OpenAPI](../rfcs/0001-openapi-renderer.md).
- More official themes.
- Sandboxed interactive documents.
- Stable third-party extension APIs.
