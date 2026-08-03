---
"tsumugu-core": minor
"tsumugu": minor
---

Shrink `search.json` by 13%, and let a plural find its singular.

`search.json` is at `schemaVersion` 2. Entries no longer carry `id`: it was the
route before percent-encoding and before the base path, which made it
byte-identical to `url` in all 298 entries of this repository's own
documentation, and nothing read it. The file is no longer indented either, but
written one entry per line — that keeps the property the indentation was really
buying, a diff that names the section that changed, without paying 15 KB to
align a file only a script fetches. Together, 233 KB to 202 KB.

Each section's text is still carried whole. RFC 5 proposed truncating it and
then measured what that costs: bounding at 300 characters saved 38% of the file
and removed 32% of the corpus's distinct words from the index, and the curve
never turns. A word that survives nowhere is a query that returns nothing, so
truncation was rejected and the savings came from the encoding instead.

Search ranking now reduces an English plural in the query to its singular,
scoring it below every exact match. Substring matching already made "diagram"
find "diagrams"; the other direction returned nothing, which is a hole rather
than a preference — "policies" found none of the 28 entries about policy.
Across ten plural queries on this site, 277 entries became reachable that were
not before. Only the query is reduced, never the index, so the index stays text
rather than tokens (ADR 4).

The page client's hash changes with it, as it does whenever the script does.
