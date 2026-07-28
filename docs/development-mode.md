---
description: What tsumugu dev does while you edit — watching, rebuilding, reloading, and what happens when something breaks.
---

# Development mode

`tsumugu dev` serves a directory and keeps serving it while you edit. This page
describes what it does between saves, and what it does when a save is wrong.

## Watching

The documentation root is watched recursively. A burst of file-system events —
which is what one save in a modern editor produces, between a temporary file, a
rename and a permissions change — is collapsed into a single rebuild after the
changes stop.

A rebuild re-scans, re-reads what changed, and re-renders only the documents
whose content actually differs, compared by content hash. Everything downstream
of a change is rebuilt: navigation, the table of contents, link validation, the
search index and the machine-readable outputs. Rebuilds are serialized, so two
quick saves settle into one coherent state rather than racing.

The terminal says what happened:

```text
rebuilt  1 document
```

## Reloading

Open pages reload themselves after a rebuild, through one small script allowed
by its hash. See [ADR 3](decisions/0003-live-reload-script-policy.md).
`--no-live-reload` is not a flag; turning watching off turns reloading off with
it, since a page told to reload when nothing is watching would be a page told
to reload by nothing.

## When a document is wrong

A document that cannot be parsed, a link that goes nowhere, front matter that is
not valid YAML: none of these stop the server. Each becomes a diagnostic
attached to the document it came from, and each appears **on that page**, under
the content, as well as in the terminal. The rest of the site is unaffected.

A document that no renderer can parse still gets a page. It says the document
could not be rendered and lists the problems, which is more useful than a blank
page or a 500.

## When a rebuild fails

The site being served is replaced in one step, at the end of a successful
rebuild. Anything that fails before that point leaves the previous site exactly
as it was, and the terminal says so:

```text
rebuild failed  The documentation root /work/docs could not be read.
  still serving the last version that built
```

The clearest case is the documentation root disappearing — a branch switch, a
directory moved, a network share dropping. Reading it fails, the rebuild aborts,
and the reader keeps the pages that existed a moment ago. Putting the directory
back and saving anything recovers on the next rebuild; nothing has to be
restarted.

This is deliberate: a documentation server that emptied itself because a
directory was briefly unavailable would be a server nobody could trust to keep a
page open.

## Seeing what a rebuild did

Every rebuild reports what it actually performed, and the terminal prints it:

```text
rebuilt  1 document in 24 ms
```

The same numbers are available programmatically as `UpdateSummary` from
`Site.update()` — documents rendered, reused and removed, pages serialized, and
the wall-clock cost. The counts are the observability model: `rendered: 300`
after a one-line edit _is_ the bug report, no tracing required, and
`tests/performance.test.ts` asserts on exactly these numbers so the pipeline
cannot stop being incremental without a test saying so.

Deeper instrumentation — per-stage timings, per-document traces — is
deliberately absent until a problem needs it that these counts cannot name.

## What is cached, and what invalidates it

Three caches, each keyed on something that cannot lie about staleness, all
in memory and all rebuilt from the file system on restart — there is nothing
on disk to go stale:

| Cached                                                                        | Invalidated by                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| the loaded document                                                           | file size or modification time                                                 |
| the parsed, transformed, themed body — and its outline, links and search text | the content hash                                                               |
| the serialized page                                                           | a signature over the navigation, the site name, and the page's own diagnostics |

The guarantees, stated as behaviour: an unchanged file is never re-read; an
unchanged document is never re-parsed; and a page is re-serialized only when
the document changed or something on every page (the sidebar, the site name)
did. `docs/performance.md` shows what these are worth in milliseconds.

## Colour

Output is coloured when it is written to a terminal, and plain when it is piped
or redirected. `NO_COLOR` turns colour off; `FORCE_COLOR` turns it on.
Diagnostics are preceded by a count, so a wall of warnings is one line you can
decide to read.
