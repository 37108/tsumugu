# tsumugu-core

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
