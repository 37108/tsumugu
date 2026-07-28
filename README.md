<p align="center">
  <img src="assets/logo.svg" alt="tsumugu" width="260">
</p>

<p align="center">
  A zero-config documentation server that turns plain Markdown, MDX and HTML files<br>
  into a documentation experience for humans <em>and</em> AI.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tsumugu"><img alt="npm" src="https://img.shields.io/npm/v/tsumugu?color=274177&label=npm"></a>
  <a href="https://github.com/37108/tsumugu/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/37108/tsumugu/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-274177"></a>
</p>

<br>

```bash
npx tsumugu dev docs
```

That is the whole setup. Tsumugu turns the directory into a site with
navigation and search. The source files remain ordinary files that work without
Tsumugu.

> 紡ぐ (_tsumugu_): to spin thread. Separate files woven into one fabric.

## What you get

|                   |                                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reading**       | typography-first theme, dark mode from the system preference, responsive from a phone up, WCAG 2.2 AA targets with the receipts in [`docs/designs/accessibility.md`](docs/designs/accessibility.md) |
| **Navigation**    | sidebar and landing page derived from your directories, per-page table of contents that follows your reading position, stable heading anchors                                                       |
| **Search**        | ranked, per-section results as you type, with a real `/search` page when JavaScript is off                                                                                                          |
| **Code**          | Shiki highlighting in both colour schemes, a copy control on every block                                                                                                                            |
| **For machines**  | `documents.json`, `llms.txt`, `search.json` and `sitemap.xml`, generated from the same documents as the pages                                                                                       |
| **While writing** | watch mode with incremental rebuilds and live reload; broken links, missing anchors and front-matter typos reported _on the page they belong to_                                                    |
| **Shipping**      | `tsumugu build` writes the same site to static files with clean URLs                                                                                                                                |
| **Formats**       | `.md`, `.mdx` and `.html` through one semantic pipeline; MDX is parsed without execution ([ADR 6](docs/decisions/0006-mdx-without-execution.md))                                                    |

## Security is a design constraint, not a page in the docs

Documentation often has many authors, so **content does not execute**. Tsumugu
parses author markup into a semantic tree and never emits it raw. Every response
carries `Content-Security-Policy: default-src 'none'`. The two client scripts
are allowed by SHA-256 hash, and the development server binds to loopback by
default. The full threat model and its checks are in
[`docs/designs/security-model.md`](docs/designs/security-model.md).

## Conventions instead of configuration

```text
docs/
├── index.md               →  /                       the home page names the site
├── guide/
│   ├── index.md           →  /guide                  a directory's own page
│   └── getting-started.md →  /guide/getting-started
├── reference/api.html     →  /reference/api          HTML is a first-class source
└── images/diagram.svg     →  served beside the documents
```

Front matter covers the rest: `title`, `description`, `order`, `hidden`.
There is no configuration file. [ADR 5](docs/decisions/0005-no-configuration-file.md)
records the reason. To compose Tsumugu differently, use the API described in
[`docs/designs/composition.md`](docs/designs/composition.md).

## Examples

[`examples/minimal`](examples/minimal) is one file.
[`examples/handbook`](examples/handbook) shows sections, HTML beside Markdown,
front matter, images and a hidden page. Both are served by the test suite on
every commit, so they cannot quietly rot.

## Status

**Pre-alpha.** The repository has more than 930 unit, contract, integration,
accessibility, packaging, and stress tests. While the version starts with `0.`,
any release may change the public API. The packages share one version, and each
release is documented in
[`docs/designs/releasing.md`](docs/designs/releasing.md).

## Development

Node.js 24+, pnpm pinned via `packageManager`:

```bash
pnpm install
pnpm check        # the same gate CI runs
pnpm docs         # serve this repository's own documentation with itself
```

Start with [`docs/index.md`](docs/index.md). It links to the usage guides,
design documents, decisions, and RFCs.

## License

[MIT](LICENSE)
