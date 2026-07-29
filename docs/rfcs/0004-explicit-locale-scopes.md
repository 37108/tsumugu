# RFC 4: Explicit locale scopes

- **Status:** Accepted
- **Date:** 2026-07-30
- **Related:** [ADR 8](../decisions/0008-explicit-locale-scopes.md), [`docs/designs/principles.md`](../designs/principles.md), issue #120

## Problem

A documentation root can contain shared documents and one directory per locale. Tsumugu currently treats locale directories as ordinary navigation groups, so pages from every language appear in the same navigation, search, and machine-readable outputs.

Directory names cannot identify locales by themselves. A directory named `ja` may be Japanese content, but an ordinary directory can also be a valid locale identifier. Automatic discovery would change existing sites based on a heuristic.

## Proposal

Add `locales?: readonly string[]` to core's `BuildOptions` and expose it as a comma-separated `--locales` option on `tsumugu dev` and `tsumugu build`. Each value names a direct child directory and uses `Intl.Locale` canonicalization. Commands fail before startup if a named directory is missing.

Core exports `canonicalizeLocale`, `canonicalizeLocales`, and `validateLocaleDirectories` so the development and static-build adapters share the same validation instead of defining locale rules themselves.

Each named directory becomes an isolated content scope while its prefix remains in public routes. With `locales: ["ja", "en"]`, `docs/ja/guide.md` remains `/ja/guide`. The shared `/` scope excludes both locale directories. Navigation, search pages, search indexes, document exports, and language-model exports contain only their scope. One root sitemap contains all scopes.

The shared scope uses `lang`, exposed as `--lang`, for its HTML language. Locale scopes use their canonical locale. Tsumugu does not infer document counterparts, redirect readers, or add a locale switcher. Omitting `locales` preserves the existing single-site behavior.

Semantic nodes may carry a `lang` value when one generated fragment differs from its page. Theme rendering transfers that value to the rendered element, which keeps English generated copy and localized navigation correctly identified on the same page.

## Fit

This option preserves the file system as the source of routes and keeps locale selection explicit. Core already owns document routing, navigation, search records, exports, and page language, so it can apply one scope boundary consistently to every output. The proposal adds no dependency, configuration file, discovery rule, or extension point.

The new field earns its public surface because the CLI uses it and both development and static builds exercise it. Tests cover canonical locale names, missing directories, scope isolation, generated pages, updates, base paths, and the emitted binary.

## Alternatives

ADR 8 records the alternatives: one process per locale cannot combine shared and localized content into one site; automatic discovery misclassifies directories; removing prefixes creates route collisions; and automatic switching requires a translation correspondence model that the file tree does not contain.

## Evidence

The maintainer accepted the routing, validation, language, export, empty-state, and testing behavior during the design session of 2026-07-30. Issue #120 records the resulting specification and acceptance criteria. ADR 8 records the decision.
