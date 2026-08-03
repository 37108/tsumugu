# Roadmap

Tsumugu develops through working vertical slices. Each milestone tests an
architectural claim before the project adds more public surface.

Milestones 0 through 6 are implemented on `main`, and the packages are published:
the current release is `0.8.0`. Configuration discovery was dropped in favor of
the decision recorded in [ADR 5](../decisions/0005-no-configuration-file.md).

Being published is not being stable. `0.x` promises nothing, no public API has
finished the path in [`principles.md`](principles.md), and `1.0.0` is a
compatibility promise that nothing here has earned yet.

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

Diagrams and API descriptions left this list once the evidence arrived. A
prototype measured what Mermaid does under a DOM emulation, and the answer
changed the design rather than confirming it
([ADR 9](../decisions/0009-diagrams-drawn-at-build-time.md)); reading RFC 1
against the code showed that a renderer cannot claim a format core does not
know, which is what core learned
([ADR 10](../decisions/0010-api-descriptions-claimed-by-name.md)). Search went
the same way twice: trimming the index was built, measured, and dropped because
it costs more vocabulary than it saves bytes
([RFC 5](../rfcs/0005-search-index-pipeline.md)), and BM25 was built, measured
against a query set, and dropped because it lost to ten lines
([RFC 6](../rfcs/0006-ranking-against-a-query-set.md)).

The issue tracker is the backlog. Work outside these milestones belongs in the
later list until usage or a prototype supplies evidence.

## Later, with evidence

- **A search index that does not grow with the corpus.** This is the nearest
  one. `search.json` costs about 6 KB per document of real prose and is fetched
  whole on first use, so a thousand-document project downloads something near
  6 MB before its first result. [RFC 5](../rfcs/0005-search-index-pipeline.md)
  took 13% off the encoding and measured trimming the text, which does not pay;
  what is left is a different strategy rather than a smaller file, and it waits
  for somebody with a corpus that large.
- More official themes.
- Sandboxed interactive documents.
- Stable third-party extension APIs. Nothing has finished the path to a stable
  API yet, so this is also what stands between `0.x` and `1.0.0`.
