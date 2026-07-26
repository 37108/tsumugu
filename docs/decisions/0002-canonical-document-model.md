# 2. Canonical document model and identity rules

- **Status:** Accepted
- **Date:** 2026-07-26
- **Supersedes:** none
- **Related:** issue #7, [`docs/architecture/overview.md`](../architecture/overview.md)

## Context

Every stage after the scanner needs to know what a document _is_: routing,
metadata resolution, rendering, caching, incremental updates, diagnostics,
search, and the machine-readable exports. If each invents its own idea of a
source file, they drift, and the same file ends up with two identities and two
routes depending on who asked.

Markdown and HTML must converge on one representation, because the whole point
of the Semantic AST boundary downstream is that format stops mattering. That
convergence has to begin here, before rendering.

Three properties make this hard:

- A document is not complete when it is discovered. The scanner knows a path and
  a size; it has not read the file. Content, metadata and a route arrive later.
- A document can be broken and must still exist. A file with unparsable front
  matter is a page the user can see in their editor, and the server has to be
  able to say something about it.
- Paths, routes and identifiers are all strings, and confusing them has
  consequences that range from a wrong URL to serving a file from outside the
  documentation root.

## Decision

### Stages are separate types, not optional fields

`DiscoveredDocument` and `LoadedDocument` are distinct types discriminated by a
`stage` field, unioned as `Document`.

The alternative is one object whose fields fill in as it progresses. That forces
every consumer to handle combinations that cannot occur, and it makes reading
content that has not been loaded a runtime bug instead of a compile error. With
separate types, a stage that has not happened is not representable.

Only two stages exist. A rendered stage arrives with the Semantic AST; more will
be added when a consumer needs to distinguish them, not in anticipation.

### Documents are immutable

Every transition returns a new value. `withDiagnostics` returns a copy, and
returns the original unchanged when there is nothing to add. Caching and
incremental invalidation both depend on being able to hold a previous version
and compare it; that is not possible if stages mutate in place.

### Identity is the normalized source path

`DocumentId` is derived from `SourcePath` and is therefore stable across every
edit to a file's contents — which is exactly what caches and change events need.

A rename produces a different identity: the old document disappears and a new
one appears. Recognising that those two events describe one file moving is a
separate problem, and a heuristic here would be wrong often enough to be worse
than the honest answer.

### Paths are relative and POSIX-separated internally

A `SourcePath` is relative to the documentation root and uses `/` on every
platform. Relative, so the same project produces the same identifiers and routes
wherever it is checked out. POSIX-separated, so a path can be compared, printed
and used as a cache key without asking which platform produced it.

`path.relative` produces backslashes on Windows, so both separators are accepted
as input and only `/` is ever stored.

Normalization repairs exactly one thing — a leading `./`. Anything else that
would change what the path refers to is rejected rather than repaired. Silently
rewriting a user's path is how a file ends up served from somewhere they did not
put it.

### Source paths, routes and identifiers are branded types

All three are branded strings obtainable only through a validating constructor.
They are structurally identical and semantically incompatible; treating a URL as
a file path is a directory-traversal bug, and the type system is the cheapest
place to make that impossible.

Constructors return a result rather than throwing. Invalid input is _expected_:
these values come from a user's directory, not from Tsumugu. A file that cannot
be represented becomes a diagnostic, not an exception that ends the process.

The mapping from a source path to a route — index files, extension removal,
trailing slashes, collisions — is deliberately **not** part of this decision.
This model defines what a route is and what makes one valid; the routing rules
define how one is produced.

### Unknown metadata keys are preserved

Metadata is a normalized map. Keys are lower-cased and trimmed, so `Title` and
`title` are one key and a document cannot behave differently because of a
capital letter. Values are restricted to what survives JSON.

Keys Tsumugu has no feature for are kept, not dropped. A user who writes
`audience: internal` has said something meaningful about their document, and
"plain files forever" means the file's contents survive the tool that reads
them. Preserved keys are available to transformers and to the machine-readable
exports.

### A failed stage attaches a diagnostic and hands the document on

Diagnostics are values returned alongside the document, never logged. Severity
is `warning` (the document is still usable) or `error` (this document cannot be
produced, but the rest of the project can). There is deliberately no `fatal`: a
problem that should stop the process is not a property of one document.

Diagnostics sort deterministically and deduplicate, because stages may run
concurrently and the same underlying failure is often noticed more than once.

This is the smallest shape the model needs. The full diagnostics design — stable
codes, source ranges, remediation hints, causal chains, stage attribution — is a
separate piece of work, and this shape is expected to grow into it rather than
be replaced.

### Content hashing is change detection, not integrity

SHA-256 over the UTF-8 bytes. `isStatUnchanged` compares size and modification
time first, because both are already known from the directory listing; hashing
every file on every change would make a scan cost proportional to the size of
the project rather than the size of the edit.

The comparison can report a false "changed" — a same-size edit inside the
timestamp granularity — which costs a re-read. It cannot report a false
"unchanged" for an edit that alters size or timestamp, which is the damaging
direction.

### The model stays internal

Nothing here is exported from `@tsumugu/core`. Its public surface remains a
single `version` constant. The model will be used by the renderers, the router
and the server first; which subset deserves to be public is a question those
consumers answer, not one this decision should pre-empt.

## Consequences

### Positive

- A consumer cannot read a field belonging to a stage that has not run.
- Markdown and HTML produce structurally identical records.
- A path that arrives with Windows separators, a `./` prefix, or both, resolves
  to one identity, so a project behaves the same on every platform.
- A broken document is still a document, so failures can be shown on the page
  they belong to.
- Routing, caching and change detection have one definition of identity to agree
  on.

### Negative

- Adding a stage means adding a type and a transition rather than a field. This
  is the intended cost; it is what keeps invalid combinations unrepresentable.
- Branded types require a cast inside each constructor. The casts are confined
  to the validating functions, which is the only place they are safe.
- Identity changing on rename means a renamed file loses its cache entry and its
  history. Accepted for now: the alternative is guessing.
- Preserving unknown metadata keys means carrying data nothing reads yet.

### Follow-up required

- The routing rules must produce `RoutePath` values through the constructor
  here, and must define index, extension and collision behaviour.
- The diagnostics work must extend `DocumentDiagnostic` rather than replace it.
- The Semantic AST work adds the rendered stage.

## Alternatives considered

**One `Document` type with optional fields.** Simpler to write and to pass
around. Rejected: every consumer would have to handle field combinations that
never occur, and `document.content` would be `string | undefined` forever,
turning a compile-time guarantee into a runtime check repeated everywhere.

**Mutable documents enriched in place.** Fewer allocations, and a stage could
annotate without rebuilding. Rejected: incremental invalidation needs to compare
a previous version against a current one, which is impossible if a stage has
already overwritten it.

**A content-derived identifier.** Would make a renamed file keep its identity
when its contents are unchanged. Rejected: it makes an _edit_ change identity,
which is the far more common event and exactly what caches must survive.

**Absolute paths internally.** No conversion at the file-system boundary.
Rejected: identifiers and cache keys would then depend on the checkout
directory, so two developers would produce different data for the same project.

**Plain strings for paths and routes.** Less ceremony. Rejected: the failure it
prevents — a route used as a file path — is a security bug, and it is
indistinguishable from correct code by inspection.

**Rejecting unknown metadata keys.** Would give a strict, well-defined schema
and catch typos. Rejected: it makes the tool lossy about the user's own file,
and a typo warning is not worth discarding data the user deliberately wrote.
