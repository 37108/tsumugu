---
title: Decisions
description: Accepted architectural decisions and the alternatives that were rejected.
order: 4
---

# Decisions

An architecture decision record (ADR) states what was decided, what was
rejected, and why. It helps future contributors tell a deliberate constraint
from an old habit.

## When to write one

Write an ADR when a decision:

- changes the trust or security model, however narrowly (ADR 3, ADR 4);
- fixes a contract other code will accumulate around (ADR 2);
- rejects an obvious alternative for a reason that will not be obvious later.

Do not write one for a decision a test already states, or one that is cheap to
reverse. An ADR that records "we named the function `parse`" teaches nobody
anything.

## How

1. Copy the shape of an existing record: **Status, Date, Context, Decision,
   Consequences (positive, negative, follow-up), Alternatives considered.**
2. Number it after the last one and name the file
   `NNNN-short-kebab-title.md`.
3. Land it in the same pull request as the change it explains, so the decision
   and its implementation are reviewed together.

Do not delete or rewrite a superseded ADR. Change its status to
`Superseded by ADR N`, and state what changed in the new record.

## Index

| ADR                                            | Decision                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| [1](0001-runtime-and-package-compatibility.md) | Node 24+, ESM only, TypeScript builds to `dist/`                                 |
| [2](0002-canonical-document-model.md)          | documents are staged immutable values with branded path types                    |
| [3](0003-live-reload-script-policy.md)         | one hash-pinned script for live reload, development only                         |
| [4](0004-client-side-search.md)                | the page client (search, copy) ships on every page, by hash                      |
| [5](0005-no-configuration-file.md)             | no configuration file; composition is code, conventions are documented           |
| [6](0006-mdx-without-execution.md)             | `.mdx` is a source format; its expressions, components and imports never execute |

`tests/decisions.test.ts` checks that every record in this directory appears in
the index and that every index entry resolves to a file.
