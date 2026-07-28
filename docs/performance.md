---
description: What Tsumugu costs, how it is measured, and which numbers are allowed to move.
---

# Performance

## What is measured, and why

Tsumugu's product claim is feedback speed: a save should be on the screen before
the reader has looked back at the browser. That makes three numbers worth
tracking, and only three:

| Measurement              | Why it matters                                          |
| ------------------------ | ------------------------------------------------------- |
| first build              | how long `tsumugu dev` takes to answer at all           |
| rebuild, nothing changed | the floor: what a save costs when nothing needs redoing |
| rebuild, one document    | what a save actually costs                              |

Everything else — the search index, the exports — is measured because it is
cheap to measure, not because it is close to mattering.

## Running it

```bash
pnpm run bench           # 200 documents
pnpm run bench 1000      # a larger project
```

The fixture is generated: documents with front matter, headings, a code block, a
table and a link to another document, spread over ten directories. That shape is
deliberate — a thousand empty files would measure the file system rather than
the pipeline.

## Baselines

Measured on one machine (Apple Silicon, Node 26) with the official preset,
including syntax highlighting. Treat them as orders of magnitude, not as a
contract: another machine will differ by a factor, and that is fine. What is not
fine is a factor appearing between two commits on the same machine.

| Documents | First build | Rebuild, nothing changed | Rebuild, one document |
| --------- | ----------- | ------------------------ | --------------------- |
| 200       | ~490 ms     | ~20 ms                   | ~20 ms                |
| 1000      | ~3.9 s      | ~200 ms                  | ~140 ms               |

Roughly 4 ms per document for the first build, most of it parsing and
highlighting. Rebuilds are dominated by the scan, which is one `stat` per file.

## What makes a rebuild cheap

Three caches, each keyed on something that cannot lie about staleness:

- **The loaded document**, invalidated by size and modification time. An
  unchanged file is not read.
- **The themed body and the outline**, invalidated by the content hash. An
  unchanged document is not parsed, transformed or themed again.
- **The serialized page**, invalidated by a signature over everything outside
  the document that its page depends on: the navigation, the site name, and the
  page's own diagnostics.

That last one is why editing one document in a thousand-page project costs
milliseconds rather than seconds. Before it existed, every page was serialized
again on every save, because every page carries the navigation — 2.8 seconds per
keystroke-and-save at a thousand documents. The benchmark is what found it.

## Guardrail

`tests/performance.test.ts` builds a small project and fails if a rebuild that
changes nothing is not substantially cheaper than the first build. The threshold
is deliberately loose: a test that asserts milliseconds on shared CI hardware
fails for reasons that have nothing to do with the change under review. It
catches the shape of a regression — "rebuilds stopped being incremental" — not
its size.

Real numbers come from `pnpm run bench`, run by a person, on a machine they can
name.
