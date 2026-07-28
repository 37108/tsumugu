# 4. Client-side search, and the second script Tsumugu ships

- **Status:** Accepted
- **Date:** 2026-07-28
- **Supersedes:** none
- **Amends:** [ADR 3](0003-live-reload-script-policy.md)
- **Related:** issue #46, issue #53, issue #54, [`docs/machine-readable.md`](../machine-readable.md)

## Context

[ADR 3](0003-live-reload-script-policy.md) allowed exactly one script — live
reload — by its hash, and only in the development server. Every other page
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
not attempt to answer the query — matching lives in one place, and a second
implementation of it is how two searches start disagreeing.

So JavaScript makes search _instant_; its absence makes search _a page_. Neither
leaves a control that does nothing.

### The index is text, not an inverted index

`/search.json` carries each section's readable text, split by heading, from the
same export records as `documents.json`. Tokenizing on the server would fix a
matching strategy into a file that the browser, a build tool and any future
server-side search would all have to agree with.

Matching is substring, case- and accent-insensitive. It is deliberately not
fuzzy: a documentation search that guesses hides the exact page somebody asked
for.

### The script is small enough to read

About 2.6 KB and 46 lines, with no framework, no bundler and no build step. What is served is what
is written in `packages/core/src/shell/search-script.ts`, which is also what the
hash is taken over and what a reader sees in view-source.

## Consequences

### Positive

- Search works on a static host, which is where most documentation ends up.
- The security property that mattered is unchanged: documentation JavaScript
  still never runs, and the mechanism is still a hash rather than a permission.
- No dependency: no search library, no index format from elsewhere, nothing to
  keep in step with a version.

### Negative

- Pages now carry a script in production, not only in development. A CSP problem
  can no longer be a development-only problem.
- A reader with JavaScript disabled gets the fallback page rather than instant
  results.
- Substring matching will not find a word by its stem, and there is no ranking
  beyond document order. Both are visible limitations rather than hidden ones,
  and issue #54 is where they get addressed.
- The index grows with the documentation. This repository's own documentation
  produces about 145 KB, fetched once on first use and cached; a project an
  order of magnitude larger will need a trimmed index or a different strategy,
  and that is the point at which this decision should be revisited.

### Follow-up required

- Ranking and normalization (issue #54) are unsolved: results are currently in
  document order, capped at twelve.
- The static build (issue #48) must serve `/search.json` for this to work
  outside the development server.
- If a third script is ever proposed, this pair of ADRs is the precedent to
  argue against it: two is a policy, three is a habit.

## Alternatives considered

**Server-rendered search only.** Rejected because static output could not search
at all, and the roadmap has the static build as a first-class target.

**A search library.** Every candidate brings an index format, a version to keep
in step, and more bytes than the whole of this client. Substring matching over a
corpus this size does not need one.

**A nonce instead of a hash.** A nonce allows whatever the server marked, which
is a weaker promise for no benefit here: the script is static, so its hash is
knowable at build time.
