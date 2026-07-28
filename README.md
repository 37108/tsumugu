<p align="center">
  <img src="assets/logo.svg" alt="tsumugu" width="260">
</p>

<p align="center">
  A zero-config documentation server that turns plain Markdown and HTML files<br>
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

That is the whole setup. No configuration file, no build step, no framework —
a directory of files becomes a site with navigation, search, and everything
below, and your files stay ordinary files that outlive the tool.

> 紡ぐ — _tsumugu_: to spin thread. Separate files, woven into one fabric.

## What you get

|                   |                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reading**       | typography-first theme, dark mode from the system preference, responsive from a phone up, WCAG 2.2 AA targets with the receipts in [`docs/accessibility.md`](docs/accessibility.md) |
| **Navigation**    | sidebar and landing page derived from your directories, per-page table of contents that follows your reading position, stable heading anchors                                       |
| **Search**        | ranked, per-section results as you type — and a real `/search` page when JavaScript is off                                                                                          |
| **Code**          | Shiki highlighting in both colour schemes, a copy control on every block                                                                                                            |
| **For machines**  | `documents.json`, `llms.txt`, `search.json` and `sitemap.xml`, generated from the same documents as the pages                                                                       |
| **While writing** | watch mode with incremental rebuilds and live reload; broken links, missing anchors and front-matter typos reported _on the page they belong to_                                    |
| **Shipping**      | `tsumugu build` writes the same site to static files with clean URLs                                                                                                                |

## Security is a design constraint, not a page in the docs

Documentation often has many authors, so **content does not execute**: author
markup is parsed to a semantic tree and never emitted raw, every response
carries `Content-Security-Policy: default-src 'none'`, the only scripts are
two of Tsumugu's own — allowed by SHA-256 hash, so nothing else can run even
if injected — and the server binds loopback until told otherwise. The full
threat model, with the test that enforces each claim, is
[`docs/security-model.md`](docs/security-model.md).

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
There is deliberately no config file —
[ADR 5](docs/decisions/0005-no-configuration-file.md) records why — and
composing Tsumugu differently is code, documented in
[`docs/composition.md`](docs/composition.md).

## Examples

[`examples/minimal`](examples/minimal) is one file.
[`examples/handbook`](examples/handbook) shows sections, HTML beside Markdown,
front matter, images and a hidden page. Both are served by the test suite on
every commit, so they cannot quietly rot.

## Status

**Pre-alpha.** Everything works as described above and is tested — 930+ tests
across unit, contract, integration, accessibility (axe-core), packaging and
stress layers — but while the version starts with `0.`, any release may change
anything. The packages version together and each release explains itself:
[`docs/releasing.md`](docs/releasing.md).

## Development

Node.js 24+, pnpm pinned via `packageManager`:

```bash
pnpm install
pnpm check        # the same gate CI runs
pnpm docs         # serve this repository's own documentation with itself
```

Start with [`docs/index.md`](docs/index.md) — architecture, principles,
decision records and the contribution workflow all hang off it.

## License

[MIT](LICENSE)
