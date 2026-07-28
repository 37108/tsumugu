---
"tsumugu-core": patch
"tsumugu-theme-default": patch
---

The shell and theme stylesheets are now authored in Tailwind and compiled at
build time into the same inline stylesheets that always shipped. No runtime
change: same selectors, same palette, same content-security policy, zero
client dependencies.
