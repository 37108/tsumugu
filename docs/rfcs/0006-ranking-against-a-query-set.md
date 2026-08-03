# RFC 6: Ranking, against a query set

- **Status:** Draft — the measurement is here; overturning an ADR 4 decision needs agreement
- **Date:** 2026-08-03
- **Related:** [ADR 4](../decisions/0004-client-side-search.md), [RFC 5](0005-search-index-pipeline.md), [ADR 8](../decisions/0008-explicit-locale-scopes.md)

## Problem

[RFC 5](0005-search-index-pipeline.md) closed with one thing it could not do:

> **A measured improvement from BM25.** Still missing: it has to beat the
> three-tier scoring against a query set somebody wrote down, and there is no
> query set.

There is one now: 28 queries against this repository's own shared corpus of 298
entries, each naming the document a reader typing it wants. It is written out in
full under Evidence, so every number below can be disagreed with by reading the
queries rather than by trusting the score.

Against it, the ranking on `main` scores P@1 64%, MRR 0.718, and finds the right
document in the top twelve for 86% of queries. Four queries fail, and reading
them names a mechanism rather than a tuning problem:

- **"rebuild speed" returns nothing at all.** `performance.md` is about exactly
  this and says "fast", "cost" and "ms". It never says "speed".
- **"why no configuration file" misses ADR 5**, which is titled _No
  configuration file_. "why" has to match too, so a question word is a filter.
- **"raw html escape hatch" misses the section called _The two escape
  hatches_**, because the index is split by heading and "raw" and "html" live in
  a neighbouring section of the same document. Terms spread down a document's
  outline match no single entry.

All four are the same decision, which ADR 4 made deliberately:

> the query splits on whitespace and **every term must match**, so two words
> narrow a search, they do not widen it

That is right for two content words and wrong for everything else. A reader who
adds a word to a search expects a better answer, not an empty page.

Two more defects are visible in the code and neither is about scoring.

**The highest-weighted field is often the least informative.** A section heading
scores 12 against 4 for body text, and 105 of the 298 entries (35%) have a
heading that is not unique in the corpus: `Context`, `Decision`, `Consequences`,
`Positive`, `Negative` and `Alternatives considered` appear ten times each,
because that is the shape of an ADR. `Negative` on its own does not say whose
drawback it is.

**The word-start bonus cannot fire inside Japanese prose.** It is spelled
`(?:^|[^\p{L}\p{N}])term`, and Japanese has no spaces, so the only boundary it
can find is the start of a field or a position after `。` or `、`. Whether a
match scores 4 or 2 therefore depends on how recently a sentence ended, which is
not a fact about the query. [ADR 8](../decisions/0008-explicit-locale-scopes.md)
made locale scopes first-class and this repository has a `ja` one, so this is
not hypothetical — but see the honest note about it under Evidence.

## Proposal

Three changes. None adds a dependency, a configuration field, an extension
point, or a public export.

**1. A term that misses costs coverage instead of killing the entry.** Score
every term independently, sum what matched, and multiply by the square of the
fraction that matched. An entry matching every term still outranks one matching
half — "two words narrow a search" survives as a ranking rule rather than as a
filter — but half an answer beats a blank page. A single-term query is
untouched, since the fraction is 1.

This is the change that needs agreement, because ADR 4 decided the opposite on
purpose. The argument for revisiting it is the table below, not taste.

**2. A section entry carries the headings above it.** A new `trail` field holds
the enclosing headings, so `Negative` ranks as `Consequences Negative` and a
query whose words are spread down an outline can meet in one entry. The
document's own title is left out, because `document` already carries it. This is
the only index change and it costs 1,980 bytes on this repository — 0.9%.

**3. A word starts where the script changes.** The boundary test becomes a scan
for the term's position, treating a change of writing system — kana to kanji,
kanji to Latin — as a word start alongside the existing non-letter. Latin
behaviour is unchanged, and the scan removes the regular expression, so a term
made of regex syntax like `c++` no longer needs escaping.

**Deliberately not covered:** everything RFC 5 declined —
`SearchIndexBuilder`, `weight`/`keywords`/`kind` on the entry, `vectors.json`,
build-time embeddings, AI reranking, server-side search — for the reasons
recorded there, none of which this measurement changes.

**And BM25, now declined on evidence rather than on the absence of it.** It was
implemented against the query set, given the same fields including `trail`, and
it loses. One corpus, 298 entries, this RFC's own page excluded from it:

| scorer                  | P@1     | MRR       | found in twelve | empty |
| ----------------------- | ------- | --------- | --------------- | ----- |
| as merged on `main`     | 64%     | 0.718     | 86%             | 1     |
| BM25, field-boosted     | 68%     | 0.765     | 96%             | 1     |
| BM25, no field boost    | 68%     | 0.780     | 93%             | 1     |
| BM25 under the hard AND | 64%     | 0.713     | 86%             | 2     |
| change 1 alone          | 68%     | 0.790     | 100%            | 0     |
| **changes 1 and 2**     | **71%** | **0.814** | **100%**        | **0** |

The fourth row is the finding. BM25 kept under `every term must match` scores
about what the current ranking scores, so the gain was never the scorer — it was
the AND. Ten lines inside `scoreEntry` beat a tokenizer, a document-frequency
table, length normalization, and a decision about how to segment Japanese.

That is the whole of it. The strongest search available here is small, and an
engine is not part of it.

## Fit

Leans on _keep the core small_: the biggest measured improvement is ten lines in
a function that already exists, and most of this RFC's length is spent declining
things.

Leans on _generate human and machine output together_ — `trail` comes from the
same records as everything else, and is the document's outline, which the AST
already knew.

Strains ADR 4, and this time genuinely. "Every term must match" was a decision,
not an oversight, and change 1 reverses it. If this is accepted, ADR 4's ranking
section is amended and the reason recorded is a measurement.

Strains _earn public APIs_ not at all, which is worth saying: nothing here
becomes public. `schemaVersion` stays at 2 — `trail` is an added optional field,
so a reader of the file that ignores it is unaffected.

## Alternatives

**Keep the hard AND and add synonyms**, so "speed" finds "fast". It loses
because a synonym list is a maintained artifact per project and per language,
RFC 5 already put query expansion outside the document model, and it would not
have fixed "raw html escape hatch", which is a structure problem rather than a
vocabulary one.

**Adopt BM25 anyway, for the corpus we do not have yet.** Inverse document
frequency and length normalization should both matter more as a corpus grows,
and 298 entries may be too small to show it. This is the strongest argument
against this RFC and it is honest. It loses for now because it asks to pay a
tokenizer and an index format against a benefit nobody has observed, which is
the trade RFC 5 declined twice.

**Fold `trail` into `section` instead of adding a field.** Rejected: the client
renders `section` as the result's title, and `Consequences Negative` is a worse
title than `Negative`. Matching and display want different strings.

## Evidence

**The query set.** 28 queries against the shared scope, each with the document
that answers it. Written by the author of the ranking against a corpus they had
read, which is a real bias; a set written by readers would be better and does
not exist.

| query                     | answer         |     | query                  | answer           |
| ------------------------- | -------------- | --- | ---------------------- | ---------------- |
| trust flag                | ADR 7          |     | package boundaries     | workspaces       |
| operator opt in           | ADR 7          |     | dependency direction   | workspaces       |
| why no configuration file | ADR 5          |     | raw html escape hatch  | semantic AST     |
| mdx execution             | ADR 6          |     | keyboard focus         | accessibility    |
| content security policy   | security model |     | colour contrast        | accessibility    |
| search ranking            | ADR 4          |     | what is cached         | development mode |
| locale directories        | ADR 8          |     | sitemap origin         | machine-readable |
| mermaid                   | ADR 9          |     | llms.txt               | machine-readable |
| openapi                   | ADR 10         |     | immutable documents    | ADR 2            |
| rebuild speed             | performance    |     | branded types          | ADR 2            |
| benchmark baseline        | performance    |     | server sent events     | ADR 3            |
| coverage                  | testing        |     | zero configuration     | composition      |
| diagnostic codes          | diagnostics    |     | keep the core small    | principles       |
| publishing to npm         | releasing      |     | supported node version | compatibility    |

**Method.** The corpus is this repository's documentation built with this RFC
removed from it. That is not fussiness: an earlier run left it in, and the file
you are reading contains the query strings, which turned "rebuild speed" from an
empty result into a hit against itself. Every number above is from the corpus
without it.

**What the numbers can carry.** On 28 queries a P@1 difference of three points
is one query, and the MRR gaps are not significant on their own. The result that
survives that objection is recall: 86% to 100% found in the top twelve, the one
empty result gone, and all four failing queries fixed. Read the queries before
believing the decimals.

**Change 3 has no measured win, and this should be read as an argument, not a
result.** The draft of this RFC claimed it would give Japanese "more than two
score values". It does the opposite: on the `ja` scope every query tried now
produces exactly one distinct score, because a kanji compound after a particle
is a script change, so every occurrence becomes a word start. That is arguably
correct — 設定 in 「ルートを設定します」 does begin a word, and the old rule
scored it as mid-word — but "arguably correct" is not a measurement. A
14-query Japanese set was written to settle it and could not: the `ja` scope is
22 entries and both rankings score P@1 100%, MRR 1.000 against it. The corpus is
too small to disagree with anything.

So change 3 rests on the claim that a boundary which depends on how recently a
sentence ended is not a boundary, plus the fact that it removes a regular
expression and its escaping. If that is not enough, it is the one of the three
to drop; changes 1 and 2 carry the measured 0.718 → 0.814 without it.

**Still missing.** A query set written by somebody other than the author of the
ranking. A Japanese corpus large enough to rank. Whether BM25 wins at several
thousand real entries — the benchmark fixture cannot answer it, because its
documents are near-identical and inverse document frequency over them is
degenerate.
