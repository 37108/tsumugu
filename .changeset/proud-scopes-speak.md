---
"tsumugu-core": patch
---

Tell an author about the scope they are looking at when it has no index
document. A generated landing page under `/ja` said "This documentation root
has no documents yet", which names the wrong directory: what is empty is the
locale scope, and the file that fills it is `ja/index.md`. Following the old
instruction wrote a file into a directory the scope excludes.
