# tsumugu-renderer-mdx

## 0.10.0

### Patch Changes

- tsumugu-core@0.10.0
- tsumugu-renderer-html@0.10.0
- tsumugu-renderer-markdown@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [0891f49]
  - tsumugu-core@0.9.0
  - tsumugu-renderer-html@0.9.0
  - tsumugu-renderer-markdown@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [86da6c8]
  - tsumugu-core@0.8.0
  - tsumugu-renderer-html@0.8.0
  - tsumugu-renderer-markdown@0.8.0

## 0.7.1

### Patch Changes

- tsumugu-core@0.7.1
- tsumugu-renderer-html@0.7.1
- tsumugu-renderer-markdown@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies [69b26f8]
  - tsumugu-core@0.7.0
  - tsumugu-renderer-html@0.7.0
  - tsumugu-renderer-markdown@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [21f878a]
  - tsumugu-core@0.6.1
  - tsumugu-renderer-html@0.6.1
  - tsumugu-renderer-markdown@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [7310ed3]
  - tsumugu-core@0.6.0
  - tsumugu-renderer-html@0.6.0
  - tsumugu-renderer-markdown@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [8ffdea5]
  - tsumugu-core@0.5.0
  - tsumugu-renderer-html@0.5.0
  - tsumugu-renderer-markdown@0.5.0

## 0.4.1

### Patch Changes

- Updated dependencies [35ef93f]
  - tsumugu-core@0.4.1
  - tsumugu-renderer-html@0.4.1
  - tsumugu-renderer-markdown@0.4.1

## 0.4.0

### Minor Changes

- b74b4a1: Execute MDX under `--trust` (ADR 7, third phase). A new opt-in package, `tsumugu-renderer-mdx`, compiles a document with the MDX compiler, bundles it with esbuild — relative imports resolve inside the root, bare specifiers resolve like any Node import — evaluates it, and renders the result to static HTML with Preact, so anchors, search, and the exports see the executed document and no framework runtime reaches a reader. A file that will not compile or throws falls back to the ADR 6 rendering with one diagnostic. Without the flag, `.mdx` behaves exactly as before.

  Script files inside a trusted root are also served as `text/javascript` rather than as text, so `script-src 'self'` is not defeated by `nosniff`.

### Patch Changes

- Updated dependencies [a8241db]
- Updated dependencies [3fee2d2]
- Updated dependencies [b74b4a1]
- Updated dependencies [17ae6bf]
  - tsumugu-core@0.4.0
  - tsumugu-renderer-html@0.4.0
  - tsumugu-renderer-markdown@0.4.0
