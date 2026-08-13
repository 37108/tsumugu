---
"tsumugu": minor
"tsumugu-build": minor
---

Fail static builds when diagnostics cross the configured severity threshold.

`tsumugu build` now exits with code 3 after printing a completed report that
contains an error or fatal diagnostic. Pass `--fail-on-warnings` to apply the
same policy to warnings. Static build reports now include page diagnostics so
programmatic callers can apply their own policy without the build API throwing.
