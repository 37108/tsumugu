---
"tsumugu": minor
"tsumugu-core": minor
"tsumugu-build": minor
---

`tsumugu build --base /repo` publishes under a subpath, which is what a
GitHub Pages project site is. Navigation, the search form and index, the
generated pages, root-relative links the authors wrote, and every
machine-readable export carry the prefix; routes stay unprefixed internally,
and the page client reads the base from one meta tag so its hash never
changes.
