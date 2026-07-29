---
"tsumugu-renderer-html": minor
"tsumugu-renderer-markdown": minor
"tsumugu-preset": minor
---

Both renderers take one `trust` boolean instead of a `scripts` mode. It is the same declaration the CLI, the preset and the pipeline already carry (ADR 7), stated once rather than in two vocabularies. Under it, the HTML renderer also stops reporting markup with no semantic equivalent: the markup is emitted as written, so there is no deferred decision left to explain.
