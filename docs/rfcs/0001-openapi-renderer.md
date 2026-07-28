# RFC 1: An OpenAPI renderer

- **Status:** Draft — awaiting evidence of demand
- **Date:** 2026-07-28
- **Related:** issue #57, [`docs/architecture/semantic-ast.md`](../architecture/semantic-ast.md)

## Problem

API documentation usually lives in an OpenAPI document, and teams either
maintain a prose copy that drifts from it or embed a hosted viewer that brings
its own JavaScript, styling and network access — all three of which Tsumugu's
security model refuses.

## Proposal

`tsumugu-renderer-openapi`: a renderer package, exactly like the Markdown and
HTML ones.

- **Claims** `openapi.json` / `openapi.yaml` (and `*.openapi.{json,yaml}`) via
  the renderer contract's capability check; nothing else changes in core.
- **Produces the existing Semantic AST**: one heading per tag, one section per
  operation (method + path as the heading, so anchors work), parameter and
  response tables as `table` nodes, schemas as `code-block` nodes. No new node
  types in the first version — the whole point of the AST is that a new format
  arrives without the themes learning anything.
- Endpoints therefore get navigation, search entries, `documents.json` records
  and `llms.txt` mentions for free, which is the "human and AI from one source"
  claim applied to APIs.
- Parser types stay inside the package, as mdast and hast do.

Deliberately out: "try it" consoles (needs scripts and network), code-sample
generation, and `$ref` resolution across files in the first version.

## Fit

Leans on _HTML is a first-class input_ (generalised: durable formats deserve
renderers, not converters) and _one job per stage_. Strains _small core_ not at
all — that is the test of the renderer boundary.

## Alternatives

**A transformer over Markdown with embedded specs.** Rejected: specs are whole
documents, not fragments inside prose.

**Embedding an existing viewer as trusted HTML.** Rejected: it is somebody
else's application, delivered through the one hole the serializer refuses to
open.

## Evidence

Needed before acceptance: one real project wanting to serve its spec through
Tsumugu, and a prototype proving tag/operation → heading/section mapping reads
well at reference scale. Neither exists yet, which is why this is a draft.
