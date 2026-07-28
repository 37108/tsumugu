---
title: Using Tsumugu
description: Install, write, serve, and ship a documentation site — the whole workflow on one page.
order: 1
---

# Using Tsumugu

Everything on this page also exists [in Japanese](/ja/usage).

## Start

```bash
npx tsumugu dev docs
```

That serves the `docs/` directory on localhost and prints the URL. No
configuration file exists or is needed: the root is the directory you name
(or `./docs` by convention), and everything else derives from the files.

## Write

Routes mirror the file system, and three formats go through one pipeline:

```text
docs/
├── index.md          →  /            names the site with its own heading
├── guide/
│   ├── index.md      →  /guide       the section's own page
│   └── setup.md      →  /guide/setup
├── api.html          →  /api         HTML is a source, not only an output
├── notes.mdx         →  /notes       MDX parses fully — and never executes
└── images/x.svg      →  served as a file beside the documents
```

Front matter is the whole option surface per document:

```yaml
---
title: Setting up # otherwise the first heading, then the file name
description: One sentence. # shown in listings, llms.txt and search
order: 2 # sidebar position among siblings
hidden: true # unlisted everywhere, but still served
---
```

A typo like `hiden` gets a warning naming the key you probably meant. MDX
expressions and components are shown as written rather than run — that is a
security decision, recorded in
[ADR 6](/decisions/0006-mdx-without-execution).

## While you write

Watch mode is on by default: saving rebuilds only what changed and open pages
reload themselves. Problems appear **on the page they belong to** — a broken
internal link, a missing anchor, unparsable front matter — with the file and
line, and the server keeps serving the last good version if a whole rebuild
fails.

Readers get section-ranked search as they type, a copy control on code
blocks, heading anchors, and a table of contents that follows the reading
position. All of it degrades: without JavaScript the search field submits to
a real page, and everything else was server-rendered to begin with.

## Ship

```bash
npx tsumugu build docs --out dist --origin https://docs.example.com
```

`dist/` is a static site with clean URLs — `/guide/setup` is
`guide/setup/index.html` — plus `documents.json`, `llms.txt`, `search.json`
and `sitemap.xml`, generated from the same documents as the pages. Host it
anywhere that serves files.

### GitHub Pages

A project site is served under `/your-repo/`, so pass `--base`:

```bash
npx tsumugu build docs --out dist \
  --origin https://your-name.github.io --base /your-repo
```

Automate it with a workflow — this repository publishes its own documentation
with exactly this shape (`.github/workflows/pages.yml`):

```yaml
name: Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with: { node-version: 24 }
      - run: npx tsumugu build docs --out dist
          --origin https://your-name.github.io --base /your-repo
      - uses: actions/upload-pages-artifact@v4
        with: { path: dist }
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then, once, in the repository settings: **Settings → Pages → Source →
GitHub Actions**.

## Compose differently

The CLI is one composition of replaceable parts — renderers, transformers, a
theme. Swapping any of them is a small script against the same API the CLI
uses: see [Composition](/composition).
