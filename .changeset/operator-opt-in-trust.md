---
"tsumugu-core": minor
"tsumugu": minor
"tsumugu-theme-default": minor
---

Add the `--trust` flag to `dev` and `build`: the operator's declaration that the root's content is theirs. Under it, markup preserved as untrusted raw source — `<canvas>`, `<svg>`, custom elements — is emitted as written instead of shown as escaped source (ADR 7, first phase).
