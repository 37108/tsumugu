---
description: What Tsumugu generates for tools and language models, and where it comes from.
---

# Machine-readable outputs

Tsumugu serves three generated files alongside the pages:

| Path              | Format     | For                                                    |
| ----------------- | ---------- | ------------------------------------------------------ |
| `/documents.json` | JSON       | tools and agents that need the corpus without scraping |
| `/llms.txt`       | plain text | a language model that needs a map of the site          |
| `/search.json`    | JSON       | the search client in the page, and anything else       |
| `/sitemap.xml`    | XML        | search engines                                         |

All three come from the same documents, routes and metadata the pages come
from. There is no second content tree, no AI-specific source, and nothing to
keep in step by hand: that is what "human and AI from one source" has to mean to
be worth saying.

## Where the content comes from

The export records are built from the **Semantic AST**, after transformers have
run, and never from the rendered HTML. Scraping the HTML would make the corpus
depend on the theme. Changing the presentation would also change the text a
model reads, and HTML would lose structure that still exists in the AST.

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

## Search

`/search.json` is the same corpus split by heading: one entry per section, each
addressing `route#fragment`, carrying that section's text **whole**. It is text
rather than tokens, because tokenizing here would fix a matching strategy into a
file that the browser, a build and any future server-side search would all have
to agree with. It is whole because
[RFC 5](../rfcs/0005-search-index-pipeline.md) measured the alternative:
bounding each section at 300 characters saved 38% of the file and removed 32% of
the corpus's distinct words from the index.

Hidden, generated and unrenderable documents are excluded. What consumes it,
and how results are ranked, is described in
[ADR 4](../decisions/0004-client-side-search.md).

## Ordering and stability

Records are ordered by route, compared by code unit rather than by locale, so
the same project produces the same bytes on every machine. `documents.json` is
indented with two spaces and ends with a newline, because it is a file people
read in a browser and review in a diff. `search.json` is not: a script fetches
it, and the indentation cost 15 KB here to align a file nobody opens. It is
written one entry per line instead, which is the part of the indentation that
was doing the work — a diff still names the section that changed.

`documents.json` is at `schemaVersion` `1`; `search.json` is at `2`, since its
entries dropped the `id` field, which repeated `url` and which nothing read.
While Tsumugu is pre-alpha the schema may change; the version is what lets a
consumer notice rather than guess.

## Origins

A sitemap states where a site is published, and a documentation server cannot
know that. In development the origin is the address the request arrived on, so
`sitemap.xml` is inspectable locally without pretending it is publishable. A
future build adapter takes the origin as configuration.

## In a static build

`tsumugu build` writes all four files into the output directory, so the search
client and any tool that reads the corpus work the same way on a static host as
they do in development. The sitemap needs `--origin`; without it the file is
written with a placeholder and a diagnostic says so.

## Overriding one

An authored file wins. If the documentation root contains its own `llms.txt`,
that file is served and the generated one is not: somebody who committed it
meant it. The same applies to `documents.json` and `sitemap.xml`.
