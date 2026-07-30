# tsumugu-preset

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

### Patch Changes

- Updated dependencies [7310ed3]
  - tsumugu-transformer-mermaid@0.6.0
  - tsumugu-theme-default@0.6.0
  - tsumugu-core@0.6.0
  - tsumugu-renderer-html@0.6.0
  - tsumugu-renderer-markdown@0.6.0
  - tsumugu-transformer-highlight@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [8ffdea5]
  - tsumugu-core@0.5.0
  - tsumugu-renderer-html@0.5.0
  - tsumugu-renderer-markdown@0.5.0
  - tsumugu-theme-default@0.5.0
  - tsumugu-transformer-highlight@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies [35ef93f]
  - tsumugu-core@0.4.1
  - tsumugu-renderer-html@0.4.1
  - tsumugu-renderer-markdown@0.4.1
  - tsumugu-theme-default@0.4.1
  - tsumugu-transformer-highlight@0.4.1

## 0.4.0

### Minor Changes

- 3fee2d2: Both renderers take one `trust` boolean instead of a `scripts` mode. It is the same declaration the CLI, the preset and the pipeline already carry (ADR 7), stated once rather than in two vocabularies. Under it, the HTML renderer also stops reporting markup with no semantic equivalent: the markup is emitted as written, so there is no deferred decision left to explain.
- b74b4a1: Execute MDX under `--trust` (ADR 7, third phase). A new opt-in package, `tsumugu-renderer-mdx`, compiles a document with the MDX compiler, bundles it with esbuild — relative imports resolve inside the root, bare specifiers resolve like any Node import — evaluates it, and renders the result to static HTML with Preact, so anchors, search, and the exports see the executed document and no framework runtime reaches a reader. A file that will not compile or throws falls back to the ADR 6 rendering with one diagnostic. Without the flag, `.mdx` behaves exactly as before.

  Script files inside a trusted root are also served as `text/javascript` rather than as text, so `script-src 'self'` is not defeated by `nosniff`.

- 17ae6bf: Run author scripts under `--trust` (ADR 7, second phase). The renderers gain a `scripts: "preserve"` mode that keeps `<script>` elements and reports each inline script's text; the preset wires it from one `trust` option; and each page's Content-Security-Policy widens by exactly the declaration: a hash per preserved inline script, plus `'self'` for script files inside the root. Injected scripts and external origins stay refused.

### Patch Changes

- Updated dependencies [a8241db]
- Updated dependencies [3fee2d2]
- Updated dependencies [b74b4a1]
- Updated dependencies [17ae6bf]
  - tsumugu-core@0.4.0
  - tsumugu-theme-default@0.4.0
  - tsumugu-renderer-html@0.4.0
  - tsumugu-renderer-markdown@0.4.0
  - tsumugu-transformer-highlight@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [bd52a0b]
  - tsumugu-core@0.3.1
  - tsumugu-renderer-markdown@0.3.1
  - tsumugu-theme-default@0.3.1
  - tsumugu-renderer-html@0.3.1
  - tsumugu-transformer-highlight@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [de762cf]
  - tsumugu-core@0.3.0
  - tsumugu-renderer-html@0.3.0
  - tsumugu-renderer-markdown@0.3.0
  - tsumugu-theme-default@0.3.0
  - tsumugu-transformer-highlight@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [91060dc]
- Updated dependencies [d71e12b]
- Updated dependencies [42d86f2]
  - tsumugu-core@0.2.0
  - tsumugu-theme-default@0.2.0
  - tsumugu-renderer-html@0.2.0
  - tsumugu-renderer-markdown@0.2.0
  - tsumugu-transformer-highlight@0.2.0

## 0.1.0

### Minor Changes

- a06ff82: First pre-alpha release.

  `tsumugu dev` serves a directory of Markdown and HTML files with navigation, a
  table of contents, heading anchors, syntax highlighting, search, static assets,
  generated landing and error pages, and watch-driven rebuilds with live reload.
  `tsumugu build` writes the same site to a directory with clean URLs.

  Nothing here is a stable API. While the version starts with `0.`, any release
  may change anything: see `docs/designs/releasing.md`.

### Patch Changes

- Updated dependencies [a06ff82]
  - tsumugu-core@0.1.0
  - tsumugu-renderer-html@0.1.0
  - tsumugu-renderer-markdown@0.1.0
  - tsumugu-theme-default@0.1.0
  - tsumugu-transformer-highlight@0.1.0
