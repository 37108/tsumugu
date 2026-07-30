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

## Figures and API descriptions

**Diagram**:
A figure Tsumugu draws itself from text the author wrote inside a document,
carrying its own title and description for readers who cannot see it.
_Avoid_: Chart, graph, image

**Diagram source**:
The text a diagram is drawn from, which stays readable as text and stays in the
document after the diagram exists.
_Avoid_: Diagram code, mermaid block

**API description**:
A document that describes an HTTP interface — its operations, their inputs and
their responses — rather than prose about one.
_Avoid_: Spec, schema, swagger

**Operation**:
One addressable action in an API description: a method and a path taken
together.
_Avoid_: Endpoint, route, path
