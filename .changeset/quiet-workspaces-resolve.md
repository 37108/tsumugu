---
"tsumugu-transformer-mermaid": patch
"tsumugu-renderer-openapi": patch
---

Republish with a resolvable dependency on core.

`0.7.0` of both packages was created by hand with `npm publish`, which writes
`"tsumugu-core": "workspace:*"` to the registry verbatim. That is a pnpm
workspace protocol, it means nothing outside this repository, and npm cannot
install a package whose manifest contains it. Both packages existed on the
registry and neither could be installed, which made `tsumugu@0.7.0`
uninstallable too.

Nothing in either package's code changed.
