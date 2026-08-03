---
"tsumugu-core": minor
"tsumugu": minor
---

Rank search results against a query set, and stop returning nothing.

A query set exists now — 28 queries against this repository's own documentation,
written out in [RFC 6](https://github.com/37108/tsumugu/blob/main/docs/rfcs/0006-ranking-against-a-query-set.md) —
and it says the ranking that shipped found the right document in the top twelve
for 86% of them. Four found nothing useful at all: "rebuild speed", "why no
configuration file", "benchmark baseline" and "raw html escape hatch". All four
now rank, and the measured scores go from P@1 64% / MRR 0.718 to P@1 71% / MRR
0.814, with nothing empty.

Three changes did it.

A query term that matches nothing now costs coverage rather than the whole
entry. ADR 4 decided that every term must match, so that two words narrow a
search; measured, that rule returned a blank page for one query in seven. An
entry matching every term still outranks one matching half — the rule survives
as ranking rather than as a filter — and a single-word query is untouched.

Entries gained a `trail`: the headings enclosing the section. `Negative` alone
does not say whose drawback it is, and because the index is split by heading, a
query whose words were spread down a document's outline used to match no single
entry. It costs 1,980 bytes here, 0.9% of the file. `schemaVersion` stays at 2,
since a reader that ignores the new optional field is unaffected.

A word now starts where the writing system changes as well as at a non-letter.
The old test could only find a boundary in Japanese at the start of a field or
after a full stop, so whether a match scored 4 or 2 depended on how recently a
sentence had ended. Latin behaviour is unchanged, and scanning for the position
rather than matching a pattern means a term like `c++` no longer needs escaping.

BM25 was implemented against the same query set and it lost — 0.765 against
0.814 — so it is not here. Kept under the old every-term-must-match rule it
scored 0.713, which is what says the gain was the rule and not the scorer.
