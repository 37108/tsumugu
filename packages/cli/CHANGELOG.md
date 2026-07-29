# tsumugu

## 0.4.0

### Minor Changes

- a8241db: Add the `--trust` flag to `dev` and `build`: the operator's declaration that the root's content is theirs. Under it, markup preserved as untrusted raw source — `<canvas>`, `<svg>`, custom elements — is emitted as written instead of shown as escaped source (ADR 7, first phase).
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
  - tsumugu-preset@0.4.0
  - tsumugu-renderer-mdx@0.4.0
  - tsumugu-build@0.4.0
  - tsumugu-transformer-highlight@0.4.0

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
