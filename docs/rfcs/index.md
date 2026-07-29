---
title: RFCs
description: Proposals that need agreement or evidence before implementation.
order: 5
---

# RFCs

An RFC proposes a change that needs agreement before code: a new or breaking
public API, a new extension category, a change to the security or trust model,
a new package boundary, or official support for a new source format.
`CONTRIBUTING.md` lists the full set; internal refactors and fixes never need
one.

ADRs and RFCs differ in tense. An ADR records a decision that was made; an RFC
proposes one that has not been. An accepted RFC usually produces an ADR when it
lands.

## Process

1. Copy `0000-template.md` to `NNNN-short-kebab-title.md`, numbered after the
   last RFC.
2. Open a pull request containing only the RFC. Discussion happens on that
   pull request.
3. It merges as **Accepted** or **Rejected**; a rejected RFC merges too,
   because the reasons against something are worth as much as the reasons for
   the things that exist.
4. A **Draft** may merge when the design is worth recording but the evidence to
   decide is missing; it names what evidence would decide it.

## Index

| RFC                                 | Status   | Proposal                                              |
| ----------------------------------- | -------- | ----------------------------------------------------- |
| [1](0001-openapi-renderer.md)       | Draft    | an OpenAPI renderer, as a renderer package            |
| [2](0002-mermaid-renderer.md)       | Draft    | Mermaid diagrams, and why not yet                     |
| [3](0003-operator-opt-in-trust.md)  | Accepted | `--trust`: the operator opts the root in to execution |
| [4](0004-explicit-locale-scopes.md) | Accepted | explicit locale scopes within one documentation root  |
