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

## Colour

Output is coloured when it is written to a terminal, and plain when it is piped
or redirected. `NO_COLOR` turns colour off; `FORCE_COLOR` turns it on.
Diagnostics are preceded by a count, so a wall of warnings is one line you can
decide to read.
