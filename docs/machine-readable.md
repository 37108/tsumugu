---
description: What Tsumugu generates for tools and language models, and where it comes from.
---

# Machine-readable outputs

Tsumugu serves three generated files alongside the pages:

| Path              | Format     | For                                                    |
| ----------------- | ---------- | ------------------------------------------------------ |
| `/documents.json` | JSON       | tools and agents that need the corpus without scraping |
| `/llms.txt`       | plain text | a language model that needs a map of the site          |
| `/sitemap.xml`    | XML        | search engines                                         |

All three come from the same documents, routes and metadata the pages come
from. There is no second content tree, no AI-specific source, and nothing to
keep in step by hand: that is what "human and AI from one source" has to mean to
be worth saying.

## Where the content comes from

The export records are built from the **Semantic AST**, after transformers have
run, and never from the rendered HTML. Scraping the HTML would make the corpus
depend on the theme — change the presentation and the text a model reads
changes with it — and it would lose structure the AST still has.

Each record carries the canonical route, the resolved title and description, the
document's headings with their identifiers, the readable text block by block,
the source format, and the content hash. It does **not** carry the source file:
that is already on disk beside the document, and duplicating it would double the
size of the corpus to say nothing new.

## What appears where

| Document               | `documents.json` | `llms.txt` | `sitemap.xml` |
| ---------------------- | ---------------- | ---------- | ------------- |
| ordinary               | yes              | yes        | yes           |
| `hidden: true`         | yes, flagged     | no         | no            |
| generated landing page | yes, flagged     | no         | yes           |
| failed to render       | yes, flagged     | no         | no            |

A hidden document is in the corpus because a tool asking what the project
contains should get the truth. It is out of `llms.txt` and the sitemap because
appearing in either is a recommendation to read or index the page, which is the
opposite of what `hidden` asks for.

## Ordering and stability

Records are ordered by route, compared by code unit rather than by locale, so
the same project produces the same bytes on every machine. `documents.json` is
indented with two spaces and ends with a newline, because it is a file people
read in a browser and review in a diff.

`schemaVersion` is `1`. While Tsumugu is pre-alpha the schema may change; the
version is what lets a consumer notice rather than guess.

## Origins

A sitemap states where a site is published, and a documentation server cannot
know that. In development the origin is the address the request arrived on, so
`sitemap.xml` is inspectable locally without pretending it is publishable. A
future build adapter takes the origin as configuration.

## Overriding one

An authored file wins. If the documentation root contains its own `llms.txt`,
that file is served and the generated one is not: somebody who committed it
meant it. The same applies to `documents.json` and `sitemap.xml`.
