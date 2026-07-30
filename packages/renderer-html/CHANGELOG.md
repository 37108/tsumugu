# tsumugu-renderer-html

## 0.7.0

### Patch Changes

- Updated dependencies [69b26f8]
  - tsumugu-core@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [21f878a]
  - tsumugu-core@0.6.1

## 0.6.0

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

- 3fee2d2: Both renderers take one `trust` boolean instead of a `scripts` mode. It is the same declaration the CLI, the preset and the pipeline already carry (ADR 7), stated once rather than in two vocabularies. Under it, the HTML renderer also stops reporting markup with no semantic equivalent: the markup is emitted as written, so there is no deferred decision left to explain.
- 17ae6bf: Run author scripts under `--trust` (ADR 7, second phase). The renderers gain a `scripts: "preserve"` mode that keeps `<script>` elements and reports each inline script's text; the preset wires it from one `trust` option; and each page's Content-Security-Policy widens by exactly the declaration: a hash per preserved inline script, plus `'self'` for script files inside the root. Injected scripts and external origins stay refused.

### Patch Changes

- Updated dependencies [a8241db]
- Updated dependencies [b74b4a1]
- Updated dependencies [17ae6bf]
  - tsumugu-core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [bd52a0b]
  - tsumugu-core@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [de762cf]
  - tsumugu-core@0.3.0

## 0.2.0

### Patch Changes

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
