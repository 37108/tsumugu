# tsumugu-core

## 0.9.0

### Minor Changes

- 0891f49: Rank search results against a query set, and stop returning nothing.

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

## 0.8.0

### Minor Changes

- 86da6c8: Shrink `search.json` by 13%, and let a plural find its singular.

  `search.json` is at `schemaVersion` 2. Entries no longer carry `id`: it was the
  route before percent-encoding and before the base path, which made it
  byte-identical to `url` in all 298 entries of this repository's own
  documentation, and nothing read it. The file is no longer indented either, but
  written one entry per line — that keeps the property the indentation was really
  buying, a diff that names the section that changed, without paying 15 KB to
  align a file only a script fetches. Together, 233 KB to 202 KB.

  Each section's text is still carried whole. RFC 5 proposed truncating it and
  then measured what that costs: bounding at 300 characters saved 38% of the file
  and removed 32% of the corpus's distinct words from the index, and the curve
  never turns. A word that survives nowhere is a query that returns nothing, so
  truncation was rejected and the savings came from the encoding instead.

  Search ranking now reduces an English plural in the query to its singular,
  scoring it below every exact match. Substring matching already made "diagram"
  find "diagrams"; the other direction returned nothing, which is a hole rather
  than a preference — "policies" found none of the 28 entries about policy.
  Across ten plural queries on this site, 277 entries became reachable that were
  not before. Only the query is reduced, never the index, so the index stays text
  rather than tokens (ADR 4).

  The page client's hash changes with it, as it does whenever the script does.

## 0.7.1

## 0.7.0

### Minor Changes

- 69b26f8: Serve an OpenAPI description as a page.

  A file named `api.openapi.yaml`, or the bare `openapi.yaml`, is now a document
  rather than an asset: `info.title` names the page, each tag becomes a section,
  and each operation becomes a subsection headed by its method and path, so an
  operation has an address and turns up in navigation, search, `documents.json`
  and `llms.txt`. Parameters and responses are tables and schemas are code, with
  no viewer and no client JavaScript. Every other `.yaml` and `.json` file stays
  an asset (ADR 10).

  `$ref` resolves within the description; a cycle expands once and then shows the
  name, and a reference into another file reports a warning and shows the name. A
  Swagger 2.0 description renders its `info` and says to convert it.

  Core's `SourceFormat` gains `openapi`, and the extension table gains
  `.openapi.json`, `.openapi.yaml`, `.openapi.yml` and the bare `openapi.*` names.

  The default theme's scroll containers around tables and figures are now
  `role="group"` rather than `role="region"`. A region is a landmark, so a page
  with two tables put two entries called "Table" in a screen reader's landmark
  list; an API page, which always has several, made it obvious.

## 0.6.1

### Patch Changes

- 21f878a: Tell an author about the scope they are looking at when it has no index
  document. A generated landing page under `/ja` said "This documentation root
  has no documents yet", which names the wrong directory: what is empty is the
  locale scope, and the file that fills it is `ja/index.md`. Following the old
  instruction wrote a file into a directory the scope excludes.

## 0.6.0

### Minor Changes

- 7310ed3: Draw Mermaid diagrams at build time, with no dependency and no browser.

  A fenced block tagged `mermaid` becomes an inline SVG figure: it follows the
  reader's light or dark theme, its text stays selectable and searchable, its
  source still reaches search and the machine-readable exports, and no script is
  shipped for it. The new `tsumugu-transformer-mermaid` package is registered in
  the default composition, so `npx tsumugu dev docs` draws diagrams with no flag
  and nothing installed.

  Tsumugu draws a documented subset rather than running Mermaid: flowcharts
  (`graph`/`flowchart` with `TD`, `TB`, `LR`, `RL`, `BT`) and `sequenceDiagram`.
  Anything outside it stays a code block and reports a warning naming what was not
  drawn, positioned inside the diagram rather than at the fence. ADR 9 records the
  measurements that ruled out the alternatives.

  Core's Semantic AST gains a `diagram` block node carrying the drawing, its
  accessible name and description, and the source it came from. Consumers that
  switch exhaustively over `BlockNode` must handle it; a theme that does not
  render it falls back to the description rather than emptying the page.

## 0.5.0

### Minor Changes

- 8ffdea5: Add explicit locale scopes to `dev`, `build`, and the programmatic build API.
  `--locales ja,en-US` maps named direct child directories to isolated route,
  navigation, search, and export scopes while documents outside them remain at
  the shared root. `--lang` controls the shared scope's HTML language. Core also
  exports locale canonicalization and directory validation for adapters.

## 0.4.1

### Patch Changes

- 35ef93f: Harden CLI base-path parsing against expensive inputs and keep the live-reload client script free of dynamic code construction.

## 0.4.0

### Minor Changes

- a8241db: Add the `--trust` flag to `dev` and `build`: the operator's declaration that the root's content is theirs. Under it, markup preserved as untrusted raw source — `<canvas>`, `<svg>`, custom elements — is emitted as written instead of shown as escaped source (ADR 7, first phase).
- b74b4a1: Execute MDX under `--trust` (ADR 7, third phase). A new opt-in package, `tsumugu-renderer-mdx`, compiles a document with the MDX compiler, bundles it with esbuild — relative imports resolve inside the root, bare specifiers resolve like any Node import — evaluates it, and renders the result to static HTML with Preact, so anchors, search, and the exports see the executed document and no framework runtime reaches a reader. A file that will not compile or throws falls back to the ADR 6 rendering with one diagnostic. Without the flag, `.mdx` behaves exactly as before.

  Script files inside a trusted root are also served as `text/javascript` rather than as text, so `script-src 'self'` is not defeated by `nosniff`.

- 17ae6bf: Run author scripts under `--trust` (ADR 7, second phase). The renderers gain a `scripts: "preserve"` mode that keeps `<script>` elements and reports each inline script's text; the preset wires it from one `trust` option; and each page's Content-Security-Policy widens by exactly the declaration: a hash per preserved inline script, plus `'self'` for script files inside the root. Injected scripts and external origins stay refused.

## 0.3.1

### Patch Changes

- bd52a0b: Render Markdown task list markers as accessible, read-only checkboxes.

## 0.3.0

### Minor Changes

- de762cf: `tsumugu build --base /repo` publishes under a subpath, which is what a
  GitHub Pages project site is. Navigation, the search form and index, the
  generated pages, root-relative links the authors wrote, and every
  machine-readable export carry the prefix; routes stay unprefixed internally,
  and the page client reads the base from one meta tag so its hash never
  changes.

## 0.2.0

### Minor Changes

- 91060dc: The sidebar disclosure starts closed on narrow screens (the wide layout is
  unaffected), `tsumugu build` reports the size of what it wrote, and front
  matter keys one slip away from a known key (`hiden`, `titel`) get a warning
  naming the key they were probably reaching for.
- 42d86f2: The table of contents marks the section being read. The page client sets
  `aria-current="location"` on the entry whose heading last crossed the reading
  line, throttled to one frame; the stylesheet draws the same indigo thread the
  sidebar uses for the current page.

### Patch Changes

- d71e12b: The shell and theme stylesheets are now authored in Tailwind and compiled at
  build time into the same inline stylesheets that always shipped. No runtime
  change: same selectors, same palette, same content-security policy, zero
  client dependencies.

## 0.1.0

### Minor Changes

- a06ff82: First pre-alpha release.

  `tsumugu dev` serves a directory of Markdown and HTML files with navigation, a
  table of contents, heading anchors, syntax highlighting, search, static assets,
  generated landing and error pages, and watch-driven rebuilds with live reload.
  `tsumugu build` writes the same site to a directory with clean URLs.

  Nothing here is a stable API. While the version starts with `0.`, any release
  may change anything: see `docs/designs/releasing.md`.
