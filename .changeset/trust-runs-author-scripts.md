---
"tsumugu-core": minor
"tsumugu": minor
"tsumugu-preset": minor
"tsumugu-renderer-html": minor
"tsumugu-renderer-markdown": minor
---

Run author scripts under `--trust` (ADR 7, second phase). The renderers gain a `scripts: "preserve"` mode that keeps `<script>` elements and reports each inline script's text; the preset wires it from one `trust` option; and each page's Content-Security-Policy widens by exactly the declaration: a hash per preserved inline script, plus `'self'` for script files inside the root. Injected scripts and external origins stay refused.
