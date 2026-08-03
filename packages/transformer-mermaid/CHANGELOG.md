# tsumugu-transformer-mermaid

## 0.8.0

### Patch Changes

- Updated dependencies [86da6c8]
  - tsumugu-core@0.8.0

## 0.7.1

### Patch Changes

- d3f344e: Republish with a resolvable dependency on core.

  `0.7.0` of both packages was created by hand with `npm publish`, which writes
  `"tsumugu-core": "workspace:*"` to the registry verbatim. That is a pnpm
  workspace protocol, it means nothing outside this repository, and npm cannot
  install a package whose manifest contains it. Both packages existed on the
  registry and neither could be installed, which made `tsumugu@0.7.0`
  uninstallable too.

  Nothing in either package's code changed.
  - tsumugu-core@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies [69b26f8]
  - tsumugu-core@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [21f878a]
  - tsumugu-core@0.6.1

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
  - tsumugu-core@0.6.0
