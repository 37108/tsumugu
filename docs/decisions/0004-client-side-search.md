# 4. Client-side search, and the second script Tsumugu ships

> **Amended:** the second script is now the _page client_: it carries search
> and the copy control on code blocks, under one hash. The policy still names
> exactly two scripts. Ranking, added for issue #54, is defined below.
>
> **Amended again by [RFC 5](../rfcs/0005-search-index-pipeline.md):** the index
> is at `schemaVersion` 2 — entries dropped `id` and the file is no longer
> indented — and ranking falls back from an English plural to its singular. The
> decision that the index is text rather than tokens is unchanged, and RFC 5
> records the measurement that kept it that way.
>
> **And by [RFC 6](../rfcs/0006-ranking-against-a-query-set.md):** "every term
> must match", below, is reversed. RFC 6 built a query set, measured the rule,
> and found it returning nothing for four of 28 queries; it also measured BM25
> against the same set and BM25 lost. Entries gained a `trail`, and the ranking
> reads it.

- **Status:** Accepted
- **Date:** 2026-07-28
- **Supersedes:** none
- **Amends:** [ADR 3](0003-live-reload-script-policy.md)
- **Related:** issue #46, issue #53, issue #54, [`docs/designs/machine-readable.md`](../designs/machine-readable.md)

## Context

[ADR 3](0003-live-reload-script-policy.md) allowed exactly one script, live
reload, by its hash and only in the development server. Every other page
Tsumugu produced ran no JavaScript at all.

Search does not fit inside that. A reader typing in a search field expects
results as they type, and there are only three ways to produce them:

- **A server** answers each keystroke. That works in `tsumugu dev` and cannot
  work in static output, which is a file tree on a host with no server.
- **A form submission** per query. It works everywhere and it is a page load per
  search, which is not what anybody means by search in documentation.
- **A script in the browser** filters an index it fetched once.

The third is what documentation sites do, and the reason is not fashion: the
index is small, the matching is trivial, and the alternative costs a round trip
per keystroke or a full navigation per query.

## Decision

### Search ships as a second hash-pinned script, on every page

The content security policy becomes:

```text
script-src 'sha256-<search>' 'sha256-<live reload, development only>'; connect-src 'self'
```

Two hashes, no `'self'`, no nonce, no `'unsafe-inline'`. A hash allows one exact
byte sequence, so a script an author put in their documentation and a script an
attacker injected are both still refused. What changed from ADR 3 is that one of
the allowed scripts is now present in every mode, including a future static
build, rather than only in development.

`connect-src 'self'` was already there for live reload; the search client uses
it to fetch `/search.json` from the same origin.

### The field degrades to a real page, not to nothing

The search control is a `<form method="get" action="/search">`. With no script
it submits to `/search`, a generated page listing every document. That page does
not attempt to answer the query. Matching lives in one place, and a second
implementation of it is how two searches start disagreeing.

So JavaScript makes search _instant_; its absence makes search _a page_. Neither
leaves a control that does nothing.

### The index is text, not an inverted index

`/search.json` carries each section's readable text, split by heading, from the
same export records as `documents.json`. Tokenizing on the server would fix a
matching strategy into a file that the browser, a build tool and any future
server-side search would all have to agree with.

Matching is substring, case- and accent-insensitive (lowercase, Unicode NFKD,
combining marks stripped), and deliberately not fuzzy: a documentation search
that guesses hides the exact page somebody asked for.

Ranking, added later for issue #54:

- the query splits on whitespace and **every term must match**, so two words
  narrow a search, they do not widen it — reversed by RFC 6, which measured it
  returning nothing at all for one query in seven; a term that misses now costs
  coverage, and an entry matching every term still outranks one matching half;
- a match in the section heading outweighs the document title, which outweighs
  the body text, and a match at the start of a word outweighs one inside it;
- the headings above a section rank with it (RFC 6), because `Negative` alone
  does not say whose drawback it is;
- a word starts where the writing system changes as well as at a non-letter
  (RFC 6), since the older test could only find a boundary in Japanese at the
  start of a field or after `。`;
- an English plural in the query falls back to its singular, scoring below
  every exact match, so "diagrams" finds a section about a diagram — added by
  RFC 5, and only the query is reduced, which is what keeps the index text;
- ties keep document order, and no document contributes more than three of the
  twelve results, so one long page cannot fill the list.

The scoring function is embedded into the script from the same TypeScript
source the unit tests call, so the ranking the browser runs is the ranking the
tests saw.

### The script is small enough to read

About 8 KB, with no framework, no bundler and no build step — it was 2.6 KB when
it only did search, and it has since taken on the copy control and the table of
contents. What is served is what is written in
`packages/core/src/shell/client-script.ts`, which is also what the hash is taken
over and what a reader sees in view-source.

## Consequences

### Positive

- Search works on a static host, which is where most documentation ends up.
- The security property that mattered is unchanged: documentation JavaScript
  still never runs, and the mechanism is still a hash rather than a permission.
- No dependency: no search library, no index format from elsewhere, nothing to
  keep in step with a version.

### Negative

- Pages carry a script in production as well as development. A CSP problem
  can no longer be a development-only problem.
- A reader with JavaScript disabled gets the fallback page rather than instant
  results.
- Substring matching still stems nothing but English plurals. "Ran" will not
  find "run", and no query is corrected for a typo. Both are visible
  limitations rather than hidden ones.
- The index grows with the documentation. This repository's own documentation
  produced about 145 KB when this was written and 202 KB after RFC 5 removed
  13% of the encoding, fetched once on first use and cached; a project an order
  of magnitude larger will need a different strategy, because RFC 5 measured
  trimming the text and it does not pay. That is the point at which this
  decision should be revisited.

### Follow-up required

- ~~The static build (issue #48) must serve `/search.json` for this to work
  outside the development server.~~ Done: `tsumugu build` writes it, per scope,
  and `packages/build/src/index.test.ts` checks that it is there.
- If another script is proposed, review whether the client code should remain
  split and update the content security policy explicitly.

## Alternatives considered

**Server-rendered search only.** Rejected because static output could not search
at all, and the roadmap has the static build as a first-class target.

**A search library.** Every candidate brings an index format, a version to keep
in step, and more bytes than the whole of this client. Substring matching over a
corpus this size does not need one.

**A nonce instead of a hash.** A nonce allows whatever the server marked, which
is a weaker promise for no benefit here: the script is static, so its hash is
knowable at build time.
