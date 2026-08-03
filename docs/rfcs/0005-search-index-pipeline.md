# RFC 5: A search index pipeline

- **Status:** Accepted, in a different shape — trimming was measured and lost; [ADR 4](../decisions/0004-client-side-search.md) records what landed
- **Date:** 2026-08-03
- **Related:** [ADR 4](../decisions/0004-client-side-search.md), [`docs/designs/machine-readable.md`](../designs/machine-readable.md), [`docs/designs/principles.md`](../designs/principles.md)

## Problem

A proposal arrived asking for a `SearchIndexBuilder`: a stage that turns the
semantic document model into one or more search artifacts — `search.json` now, a
vector index and third-party formats later — so that search can improve without
touching parsing or rendering.

Half of that already exists, and the half that does not is worth naming
precisely. `/search.json` is built by `searchEntries` in
`packages/core/src/exports/search.ts`, from the same export records as
`documents.json`, split by heading, at build time. Ranking is a separate thing
again: `scoreEntry` in `packages/core/src/shell/client-script.ts`, run in the
browser, once per query. Nothing searches the Semantic AST — not at query time,
not at all. So the coupling the proposal removes is coupling Tsumugu does not
have, and "the AST becomes the canonical source for generating search indexes"
describes the code as it already is.

Three real problems sit behind it.

**The index grows faster than ADR 4 expected.** ADR 4 measured 145 KB of
`search.json` for this repository's own documentation and said the strategy
should be revisited when a project is an order of magnitude larger. The build in
`dist-docs/` now produces 233 KB for the shared scope: 298 entries over 33
documents, of which 154 KB is section text. That is about 7 KB of index per
document, so a thousand-document project lands near 7 MB — fetched in full
before the first result appears. The trigger is entries, which is documents
times sections, so it arrives sooner than "an order of magnitude" suggests.

**Matching does not stem, and substring matching hides which way it fails.**
`scoreEntry` requires every query term to appear as a substring. Typing
"diagram" finds a section about diagrams; typing "diagrams" finds nothing about
a diagram. The asymmetry is not a tuning problem, it is the absence of a
tokenizer, and ADR 4 named it as a known limitation rather than a hidden one.

**There is one index shape and no seam for a second.** Core decides what
`search.json` contains. A project that needs a smaller index, or a different
one, has nowhere to put that decision.

Only the third is an argument for a builder. The first belongs to core — a
project cannot fix a 7 MB index with a plugin it has to be handed first — and
the second belongs to the client script.

## Proposal

Search becomes a pipeline when there is a second artifact, and not before. What
this RFC proposes is as much what would not change as what would.

**Nothing becomes public.** Index construction stays internal to core, in
`packages/core/src/exports/search.ts`. No `SearchIndexBuilder` interface, no
extension category, no registration order to document — there would be exactly
one implementation to register. CONTRIBUTING's progression puts the interface
last: internal implementation, use by core or an official package, evidence from
usage, then an RFC. One implementation is not evidence that a boundary holds,
and `docs/designs/roadmap.md` already parks stable third-party extension APIs
under "later, with evidence".

**The artifact keeps carrying text, not a scoring policy.** The incoming
`SearchEntry` adds `weight` and `keywords`. One weight per entry cannot express
Tsumugu's ranking, because the ranking is a function of the query: the same term
scores 6 in a section heading and 2 in body text, and a match at the start of a
word outscores one inside it. Precomputing a weight either duplicates the
client's ranking inside the file or replaces it, and the second is the coupling
ADR 4 avoided by deciding the index is a corpus rather than an inverted index. A
`kind` per block has the same shape of problem from the other direction: it
multiplies entries against the size problem above, to describe a distinction the
client does not rank by.

**The size problem was to be answered by trimming. It is not.** The shape this
RFC first proposed was to bound each entry's `text` rather than carry the
section's full prose. Building it first and measuring it is what the Evidence
section asked for, and the measurement refused the design:

| bound | file          | distinct words lost from the corpus |
| ----- | ------------- | ----------------------------------- |
| 300   | 144 KB (−38%) | 1007 of 3177 (31.7%)                |
| 600   | 184 KB (−21%) | 461 of 3177 (14.5%)                 |
| 1000  | 207 KB (−11%) | 196 of 3177 (6.2%)                  |

A word that survives nowhere in the index is a query that returns nothing, and
the curve never turns: every bound pays about one and a half words of
vocabulary for each percent of file. Truncation is rejected, and `text` stays
whole.

**The size the encoding was wasting is real, and it is taken.** Of 233 KB, the
`id` field held 14 KB — it is the route before percent-encoding and before the
base path, which made it byte-identical to `url` in all 298 entries of this
site, and nothing read it — and the two-space indentation held 15 KB, aligning a
file that only a script fetches. Entries drop `id`, the file is written one
entry per line so a diff still names the section that changed, and
`schemaVersion` becomes 2. Measured: 233 KB to 202 KB, with no word removed from
the index.

**Ranking loses the asymmetry, in the client.** `scoreEntry` reduces an English
plural in the query to its singular and scores it below every exact match. Only
the query is reduced, never the index, so the file stays text and ADR 4's
decision is untouched. Measured over this site's 298 entries: "policies" went
from no results at all to 28, "documents" from 41 to 143, and ten plural queries
reached 277 entries between them that were unreachable before.

**Deliberately not covered:** `vectors.json` and build-time embeddings,
third-party search builders, server-side search, and query-expansion metadata.
Embeddings would need their own RFC and are unlikely to survive one: a build
that calls a model needs a dependency, a key and a network, and it stops
producing the same bytes on every machine, which `docs/designs/machine-readable.md`
promises and the tests check. That is three principles at once — start without
configuration, plain files forever, and the reproducibility every export rests
on — spent before the cheap fixes above had been tried.

## Fit

Leans on _generate human and machine output together_: search is already another
output of the same records, and this keeps it there instead of giving it a
second source. Leans on _keep the core small_ by declining the extension
category, which is the part of the incoming proposal its flexibility rests on.

Strains _let packages own their options_, which names search among the packages
that would own theirs. That principle anticipates a `tsumugu-search`; this RFC
declines to draw it yet, because a boundary around one function and one script
is a boundary drawn before anyone knows where the seam is.

Strains ADR 4 less than expected. The draft of this RFC assumed trimming would
end `search.json` being the whole corpus split by heading; the measurement kept
it whole, so what ADR 4 decided still holds and what changed is its encoding and
one line of its ranking. It lands as an amendment to ADR 4 rather than as a new
record, because a new ADR would claim a decision was reversed when it was
confirmed.

## Alternatives

**Accept the proposal as written.** It adds an extension category, a public
interface and two artifact formats at once, on no usage; its entry fields
contradict ADR 4; and the coupling it removes is not present. The parts worth
keeping are kept above.

**Improve ranking in the client and leave the artifact alone.** The cheapest
thing that helps a reader: a stemmer or a relaxed prefix match inside
`scoreEntry` costs no format change and no new file, and the tests already call
the function the browser runs. It loses because it does nothing about size,
which is the problem with a deadline attached.

**Adopt a search library and its index format.** ADR 4 rejected this and the
reasons hold: every candidate brings an index format, a version to keep in step,
and more bytes than the whole of the current client.

**Move search into `tsumugu-search` now.** Loses for the reason under Fit, and
it is the alternative most likely to win once a second artifact exists.

## Evidence

What had to be true, and what the implementation found:

- **The size trigger, at a real scale.** Arrived for this site: 233 KB, 298
  entries, 33 documents, from `pnpm run docs:build`. Still missing: the figure
  at a thousand documents, which `pnpm run bench 1000` can produce and nobody
  has recorded, and what the fetch actually costs a reader — it happens once per
  session, after the search field is first focused. The 13% taken here is a
  constant factor; it does not change what happens at 7 MB.
- **That trimming pays.** Arrived, and said no. The table under Proposal is the
  measurement, and it is the reason `text` is still whole.
- **A ranking failure someone hit.** Partly, and enough: "policies" returned
  nothing at all against a corpus with 28 entries about policy. That is not a
  ranking preference, it is a hole, and it did not need a reporter.
- **A second builder that exists.** Still missing, which is why there is still
  no `SearchIndexBuilder`. The work here produced one artifact in a better
  encoding, not two artifacts, so it supplies no evidence about the shape of an
  interface — and an interface is what the incoming proposal was mostly for.
- **A measured improvement from BM25.** Still missing: it has to beat the
  three-tier scoring against a query set somebody wrote down, and there is no
  query set.

What is left for the size problem is a different strategy, not a smaller file.
That belongs to whoever brings a project large enough to need it.
