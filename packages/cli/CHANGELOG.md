# tsumugu

## 0.3.1

### Patch Changes

- Updated dependencies [bd52a0b]
  - tsumugu-core@0.3.1
  - tsumugu-renderer-markdown@0.3.1
  - tsumugu-theme-default@0.3.1
  - tsumugu-build@0.3.1
  - tsumugu-preset@0.3.1
  - tsumugu-renderer-html@0.3.1
  - tsumugu-transformer-highlight@0.3.1

## 0.3.0

### Minor Changes

- de762cf: `tsumugu build --base /repo` publishes under a subpath, which is what a
  GitHub Pages project site is. Navigation, the search form and index, the
  generated pages, root-relative links the authors wrote, and every
  machine-readable export carry the prefix; routes stay unprefixed internally,
  and the page client reads the base from one meta tag so its hash never
  changes.

### Patch Changes

- Updated dependencies [de762cf]
  - tsumugu-core@0.3.0
  - tsumugu-build@0.3.0
  - tsumugu-preset@0.3.0
  - tsumugu-renderer-html@0.3.0
  - tsumugu-renderer-markdown@0.3.0
  - tsumugu-theme-default@0.3.0
  - tsumugu-transformer-highlight@0.3.0

## 0.2.0

### Minor Changes

- 91060dc: The sidebar disclosure starts closed on narrow screens (the wide layout is
  unaffected), `tsumugu build` reports the size of what it wrote, and front
  matter keys one slip away from a known key (`hiden`, `titel`) get a warning
  naming the key they were probably reaching for.

### Patch Changes

- Updated dependencies [91060dc]
- Updated dependencies [d71e12b]
- Updated dependencies [42d86f2]
  - tsumugu-core@0.2.0
  - tsumugu-build@0.2.0
  - tsumugu-theme-default@0.2.0
  - tsumugu-preset@0.2.0
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
  - tsumugu-build@0.1.0
  - tsumugu-core@0.1.0
  - tsumugu-preset@0.1.0
  - tsumugu-renderer-html@0.1.0
  - tsumugu-renderer-markdown@0.1.0
  - tsumugu-theme-default@0.1.0
  - tsumugu-transformer-highlight@0.1.0
