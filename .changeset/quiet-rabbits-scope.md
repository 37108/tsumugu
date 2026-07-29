---
"tsumugu": minor
"tsumugu-core": minor
"tsumugu-build": minor
---

Add explicit locale scopes to `dev`, `build`, and the programmatic build API.
`--locales ja,en-US` maps named direct child directories to isolated route,
navigation, search, and export scopes while documents outside them remain at
the shared root. `--lang` controls the shared scope's HTML language. Core also
exports locale canonicalization and directory validation for adapters.
