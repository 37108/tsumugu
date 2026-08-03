# tsumugu-renderer-openapi

## 0.8.0

### Patch Changes

- Updated dependencies [86da6c8]
  - tsumugu-core@0.8.0

## 0.7.1

### Patch Changes

- d3f344e: Republish with a resolvable dependency on core.

  `0.7.0` of both packages was created by hand with `npm publish`, which writes
  `"tsumugu-core": "workspace:*"` to the registry verbatim. That is a pnpm
  workspace protocol, it means nothing outside this repository, and npm cannot
  install a package whose manifest contains it. Both packages existed on the
  registry and neither could be installed, which made `tsumugu@0.7.0`
  uninstallable too.

  Nothing in either package's code changed.
  - tsumugu-core@0.7.1

## 0.7.0

### Minor Changes

- 69b26f8: Serve an OpenAPI description as a page.

  A file named `api.openapi.yaml`, or the bare `openapi.yaml`, is now a document
  rather than an asset: `info.title` names the page, each tag becomes a section,
  and each operation becomes a subsection headed by its method and path, so an
  operation has an address and turns up in navigation, search, `documents.json`
  and `llms.txt`. Parameters and responses are tables and schemas are code, with
  no viewer and no client JavaScript. Every other `.yaml` and `.json` file stays
  an asset (ADR 10).

  `$ref` resolves within the description; a cycle expands once and then shows the
  name, and a reference into another file reports a warning and shows the name. A
  Swagger 2.0 description renders its `info` and says to convert it.

  Core's `SourceFormat` gains `openapi`, and the extension table gains
  `.openapi.json`, `.openapi.yaml`, `.openapi.yml` and the bare `openapi.*` names.

  The default theme's scroll containers around tables and figures are now
  `role="group"` rather than `role="region"`. A region is a landmark, so a page
  with two tables put two entries called "Table" in a screen reader's landmark
  list; an API page, which always has several, made it obvious.

### Patch Changes

- Updated dependencies [69b26f8]
  - tsumugu-core@0.7.0
