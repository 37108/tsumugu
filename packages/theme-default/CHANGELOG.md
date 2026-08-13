# tsumugu-theme-default

## 0.10.0

### Patch Changes

- tsumugu-core@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [0891f49]
  - tsumugu-core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [86da6c8]
  - tsumugu-core@0.8.0

## 0.7.1

### Patch Changes

- tsumugu-core@0.7.1

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

## 0.5.0

### Patch Changes

- Updated dependencies [8ffdea5]
  - tsumugu-core@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies [35ef93f]
  - tsumugu-core@0.4.1

## 0.4.0

### Minor Changes

- a8241db: Add the `--trust` flag to `dev` and `build`: the operator's declaration that the root's content is theirs. Under it, markup preserved as untrusted raw source — `<canvas>`, `<svg>`, custom elements — is emitted as written instead of shown as escaped source (ADR 7, first phase).

### Patch Changes

- Updated dependencies [a8241db]
- Updated dependencies [b74b4a1]
- Updated dependencies [17ae6bf]
  - tsumugu-core@0.4.0

## 0.3.1

### Patch Changes

- bd52a0b: Render Markdown task list markers as accessible, read-only checkboxes.
- Updated dependencies [bd52a0b]
  - tsumugu-core@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [de762cf]
  - tsumugu-core@0.3.0

## 0.2.0

### Patch Changes

- d71e12b: The shell and theme stylesheets are now authored in Tailwind and compiled at
  build time into the same inline stylesheets that always shipped. No runtime
  change: same selectors, same palette, same content-security policy, zero
  client dependencies.
- Updated dependencies [91060dc]
- Updated dependencies [d71e12b]
- Updated dependencies [42d86f2]
  - tsumugu-core@0.2.0

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
