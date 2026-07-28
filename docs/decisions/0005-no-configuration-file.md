# 5. No configuration file

- **Status:** Accepted
- **Date:** 2026-07-28
- **Related:** issue #79, [`docs/composition.md`](../composition.md), [`docs/principles.md`](../principles.md)

## Context

Every documentation tool grows a configuration file, and the question was never
whether Tsumugu could have one — it was what a `tsumugu.config.ts` would
actually contain. Working through the vertical slice and everything after it,
the answer kept coming out empty:

- **The root** is a CLI argument, discovered by convention when omitted:
  an explicit path, then `./docs`, then the working directory when it contains
  an index document.
- **Titles, descriptions, ordering, visibility** are front matter on the
  documents they describe.
- **The site's name** comes from the home page's own title.
- **Renderers, transformers, the theme** are the preset, and replacing them is
  a programmatic composition — code that is type-checked where it is written.
- **Host, port, output directory, origin** are flags on the command that uses
  them.

What remained for a file was nothing but a second, stringly-typed spelling of
the composition API.

## Decision

Tsumugu has no configuration file, and no configuration discovery. `tsumugu dev`
and `tsumugu build` read their arguments, the file system, and nothing else.
A project that needs a different composition writes a small script against
`createSite` / `buildStatic` with `createPreset()` — the same API the CLI uses,
documented in `docs/composition.md`.

This is a decision, not a gap. It is revisited when a real composition need
appears that a script cannot express — not when a file would merely be
customary.

## Consequences

### Positive

- Nothing to discover, so nothing to discover _wrongly_: behaviour cannot
  change because of a file inherited from a parent directory.
- The zero-config promise stays honest: there is no config to be zero of.
- No schema to version, validate, document and migrate through pre-alpha.

### Negative

- A project wanting one flag permanently (a port, an origin) must repeat it or
  wrap the command in a script. `package.json` scripts are the expected home.
- If a file is ever added, its absence today becomes a migration then.

## Alternatives considered

**`tsumugu.config.ts` executing arbitrary code.** It is the composition API
with extra steps: a second entry point to secure, and a file the static build
would have to execute to know what to build.

**A declarative JSON/YAML file.** Cannot express the one thing composition
needs — registering implementations — without inventing a module-resolution
scheme inside configuration, which is plugin discovery by another name.
