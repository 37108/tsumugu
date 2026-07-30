# 10. API descriptions are documents, claimed by file name

- **Status:** Accepted
- **Date:** 2026-07-30
- **Related:** [RFC 1](../rfcs/0001-openapi-renderer.md), [ADR 2](0002-canonical-document-model.md), [`docs/designs/architecture/semantic-ast.md`](../designs/architecture/semantic-ast.md)

## Context

An OpenAPI description is the durable source for an HTTP interface, the same way
HTML is a durable source for a page. Teams either keep a prose copy that drifts
from it or embed a hosted viewer that brings its own JavaScript and network
access. Tsumugu's security model refuses the second, and the first is the problem
documentation tools exist to remove.

RFC 1 proposed a renderer and claimed "nothing else changes in core". That was
wrong. `SourceFormat` is a closed union of `markdown`, `mdx` and `html`, and the
extension table that produces it is fixed, so a `.yaml` or `.json` file is
classified as an asset before any renderer is consulted. A renderer cannot claim
a format core does not know exists.

The question is therefore not whether core changes, but how much. Two failure
modes bound it. Treating every `.yaml` and `.json` file as a candidate document
would sweep `config.json`, lock files and fixtures into the scanner and make a
data file's contents decide whether it becomes a page. Adding an extension
registry to core would buy generality with a new public API, which
`docs/designs/principles.md` asks a new concept to earn first.

## Decision

Core learns one more format, and the file name decides.

- **`SourceFormat` gains `openapi`.** The extension table maps
  `*.openapi.json`, `*.openapi.yaml`, `*.openapi.yml`, and the bare names
  `openapi.json`, `openapi.yaml`, `openapi.yml`. Every other `.yaml` and `.json`
  file stays an asset, exactly as today.
- **`tsumugu-renderer-openapi` claims that format** through the ordinary
  renderer contract, and is registered in the default preset. A project that
  does not name a file this way never notices the renderer exists.
- **Structure follows the description's own structure**: `info.title` is the
  page, each tag is a section, and each operation is a subsection whose heading
  is its method and path, so anchors address operations. Parameters and
  responses are tables; schemas are code blocks. No new AST nodes — endpoints
  therefore get navigation, search, `documents.json` and `llms.txt` for free.
  Operations with no tag collect in a trailing section rather than vanishing.
- **OpenAPI 3.0 and 3.1 are supported.** `$ref` resolves within the file;
  a cycle expands once and then shows the reference by name; a reference into
  another file reports a warning and shows the reference by name. A Swagger 2.0
  document reports a diagnostic that says to convert it, rather than being
  half-read by a parser built for a different shape.

Deliberately out, unchanged from RFC 1: "try it" consoles, which need scripts
and network access, and generated code samples.

## Consequences

### Positive

- A spec becomes a page with no viewer, no client JavaScript, and no network
  access, and its operations are searchable and linkable like any other section.
- Naming is the opt-in. `docs/api.openapi.yaml` is a deliberate act; renaming
  the file is how a project turns the feature off.
- Core grows by one format name and six extensions, not by a plugin registry.

### Negative

- Core knows a format name whose renderer lives in another package, which is
  one more place to touch when a format is added. The alternative was a public
  registry API, and one line in a table is the cheaper commitment.
- A project whose spec is called `swagger.yaml` or `api.yaml` must rename it or
  register the renderer itself.
- Two spec versions mean two shapes to keep tested as the parser grows.

### Follow-up required

- The usage guide documents the claimed names and the version support, in both
  languages.
- RFC 1's status becomes accepted, correcting its "nothing else changes in
  core" claim in the record rather than silently.

## Alternatives considered

**An extensible format table in core.** Renderers declare the extensions they
claim, and core stops holding a list. Genuinely more general, and the shape to
revisit when a third format wants in. Rejected now under _Earn public APIs_: it
is a compatibility commitment bought before there is a second caller.

**Claiming `.yaml` and `.json` broadly, then deciding on content.** The renderer
contract does receive the whole document, so `supports` could look for an
`openapi:` key. Rejected because it makes every data file in the tree a document
candidate, and makes a file's contents — not its name — decide whether a route
appears.

**A transformer over Markdown with embedded specs.** Rejected in RFC 1 and still
rejected: a description is a whole document, not a fragment inside prose.

**Embedding an existing viewer as trusted HTML.** Rejected: it is somebody
else's application, delivered through the one hole the serializer refuses to
open.
