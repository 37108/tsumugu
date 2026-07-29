---
title: How to Use
description: Install Tsumugu, write documentation, run the local server, and build a static site.
order: 1
---

# How to Use

This guide is also [available in Japanese](/japanese/how-to-use).

## Start

```bash
npx tsumugu dev docs
```

That serves the `docs/` directory on localhost and prints the URL. No
configuration file exists or is needed: the root is the directory you name
(or `./docs` by convention), and everything else derives from the files.

There is one flag worth knowing on your first run. Documentation you point
Tsumugu at is content, not code, so scripts do not run and MDX components are
shown as source. When the directory is your own and you want it to run, add
`--trust`:

```bash
npx tsumugu dev docs --trust
```

That flag is the whole of the trust setting.
[What it covers](#when-the-content-is-yours) is below.

## Write

Routes mirror the file system, and three formats go through one pipeline:

```text
docs/
├── index.md          →  /            names the site with its own heading
├── guide/
│   ├── index.md      →  /guide       the section's own page
│   └── setup.md      →  /guide/setup
├── api.html          →  /api         HTML is accepted as source input
├── notes.mdx         →  /notes       MDX parses; --trust runs it
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

A typo like `hiden` gets a warning naming the key you probably meant. Tsumugu
shows MDX expressions and components as source instead of running them, and
removes `<script>` from HTML. The reason is recorded in
[ADR 6](/decisions/0006-mdx-without-execution): content you point Tsumugu at
is not code, so it does not run.

## Separate locales

Name the locale directories explicitly when one site contains translated
documentation:

```bash
npx tsumugu dev docs --locales ja,en-US
```

```text
docs/
├── greeting.md       →  /greeting    shared scope
├── ja/
│   └── guide.md      →  /ja/guide    Japanese scope
└── en-US/
    └── guide.md      →  /en-US/guide US English scope
```

At `/`, navigation and search contain `greeting.md` but exclude everything
under `ja/` and `en-US/`. At `/ja`, they contain only `ja/`; at `/en-US`, only
`en-US/`. Each scope also gets its own `documents.json`, `llms.txt`, and
`search.json`. The root `sitemap.xml` covers the whole site.

Locale names use Unicode locale identifiers. Tsumugu canonicalizes them, so
`en-us` selects a directory named `en-US`. It stops before serving or building
if a named directory is missing, or if two names canonicalize to the same
locale. `--lang fr` sets the HTML language of the shared scope; a locale scope
always uses its own locale. Without `--locales`, directory routing and exports
work exactly as they do for an ordinary site.

## When the content is yours

Some documentation is the code: a `<canvas>` demo, an interactive example, an
MDX file built from components. Pass `--trust` and Tsumugu runs it:

```sh
tsumugu dev docs --trust
```

The flag is you saying the directory is yours. Under it, markup Tsumugu
cannot model reaches the page as written. Your scripts run: inline ones
allowed by their hash, files by `'self'`, never an external origin. And
`.mdx` executes while the page is built, so what a reader gets is static
HTML that search and the exports can read.

A file that will not run says so on the page and falls back to its source.
One broken file never costs you the site.

Leave the flag off for anything you did not write. The reasoning is in
[ADR 7](/decisions/0007-operator-opt-in-trust).

Two things to know while you work this way. A `<script>` written inside an
`.mdx` file cannot run, because MDX reads a script's contents as document
content rather than as code — put it in a file beside the document and load it
with `<script src="./demo.js">`. And a document is rebuilt when the document
changes, not when a component it imports changes, so editing a component needs
a restart today.

Tsumugu's own architecture pages are written this way: their diagrams are
computed from the same lists the prose describes. Look at
`docs/designs/architecture/index.mdx` and `docs/.components/` in the
repository for a working example. The dotted directory is deliberate — Tsumugu
refuses dotfiles, so build inputs kept there are never published beside the
documents that use them.

## While you write

Watch mode is on by default. Saving rebuilds only what changed and reloads open
pages. A broken link, missing anchor, or front matter error appears on the page
that contains it, with the source file and line. If a full rebuild fails, the
server keeps serving the last good version.

Readers get section-ranked search as they type, a copy control on code
blocks, heading anchors, and a table of contents that follows the reading
position. All of it degrades: without JavaScript the search field submits to
a real page, and everything else was server-rendered to begin with.

## Ship

```bash
npx tsumugu build docs --out dist --origin https://docs.example.com
```

`dist/` is a static site with clean URLs. For example, `/guide/setup` is written
to `guide/setup/index.html`. The build also writes `documents.json`, `llms.txt`,
`search.json`, and `sitemap.xml` from the same source documents. Host the
directory anywhere that serves static files. `build` accepts the same
`--locales` and `--lang` options as `dev`.

### GitHub Pages

A project site is served under `/your-repo/`, so pass `--base`:

```bash
npx tsumugu build docs --out dist \
  --origin https://your-name.github.io --base /your-repo
```

This repository uses `.github/workflows/pages.yml` to publish its own
documentation:

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

The CLI combines replaceable renderers, transformers, and a theme. To replace
one, write a small script against the same API. See
[Composition](/designs/composition).
