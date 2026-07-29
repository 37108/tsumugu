# Tsumugu

Tsumugu turns a directory of authored documents into a site while preserving
the author's file organization as the source of truth.

## Language

**Locale**:
A language, optionally narrowed to a regional variant, for which a site contains
localized documents. A locale is identified by a BCP 47 language tag such as
`ja`, `en`, or `en-US`.
_Avoid_: Language when a regional variant matters

**Localized document**:
A document that belongs to one locale. Localized documents do not need a
counterpart in every other locale.
_Avoid_: Translation

**Shared document**:
A document that belongs to no locale and remains available independently of the
enabled locales.
_Avoid_: Default-language document
