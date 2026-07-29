---
"tsumugu-core": minor
"tsumugu-renderer-mdx": minor
"tsumugu-renderer-markdown": minor
"tsumugu-preset": minor
"tsumugu": minor
---

Execute MDX under `--trust` (ADR 7, third phase). A new opt-in package, `tsumugu-renderer-mdx`, compiles a document with the MDX compiler, bundles it with esbuild — relative imports resolve inside the root, bare specifiers resolve like any Node import — evaluates it, and renders the result to static HTML with Preact, so anchors, search, and the exports see the executed document and no framework runtime reaches a reader. A file that will not compile or throws falls back to the ADR 6 rendering with one diagnostic. Without the flag, `.mdx` behaves exactly as before.

Script files inside a trusted root are also served as `text/javascript` rather than as text, so `script-src 'self'` is not defeated by `nosniff`.
