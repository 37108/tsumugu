# 8. Explicit locale scopes

- **Status:** Accepted
- **Date:** 2026-07-30
- **Related:** [ADR 5](0005-no-configuration-file.md), [`docs/designs/principles.md`](../designs/principles.md), [`docs/designs/machine-readable.md`](../designs/machine-readable.md)

## Context

A documentation root can contain one directory per locale and documents shared by every locale. Treating `docs/ja` and `docs/en` as ordinary navigation groups mixes their pages in navigation and search. Inferring locales from directory names would misclassify ordinary directories and make routing depend on a heuristic.

The public URL must also remain predictable from the source path. Removing the locale directory from a route would make two localized documents compete for the same URL and require another rule to select one.

## Decision

`tsumugu dev` and `tsumugu build` accept an explicit, comma-separated `--locales` option. Each value is a canonical Unicode locale identifier and names a direct child directory of the documentation root.

An enabled locale defines a content scope while preserving its source prefix in public routes. `docs/ja/guide.md` remains `/ja/guide`. Navigation, search, and machine-readable corpora under `/ja` contain only documents from `docs/ja`. Root pages and root corpora exclude every enabled locale. The root sitemap contains every public page.

Locale directories are not discovered. A directory becomes a locale only when the operator names it, and commands without `--locales` retain the existing single-site behavior. Tsumugu does not infer translations, redirect readers, or add a locale switcher.

## Consequences

### Positive

- Authors can preview and build shared and localized content with one command.
- Routes remain visible in the file system and distinct across locales.
- Navigation, search, and machine outputs do not mix languages.
- Explicit locale names avoid misclassifying ordinary directories.

### Negative

- Authors repeat `--locales` or place the command in an existing package script.
- Tsumugu cannot select a locale from browser preferences.
- Authors provide their own links between locale roots.

## Alternatives considered

**One command per locale.** This keeps the pipeline unchanged but cannot serve shared documents and several locales as one site.

**Automatic directory discovery.** This removes the option but cannot distinguish a locale identifier from an ordinary directory with the same name.

**Routes without locale prefixes.** This makes localized documents collide and hides the source-to-route relationship.

**Automatic locale switching.** This requires a correspondence model for missing or differently named documents. The directory structure does not provide that model.
