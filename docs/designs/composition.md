# Composition

## What zero configuration means

Running `tsumugu dev` with no configuration file is not the absence of
decisions. It is one composition, written down in `tsumugu-preset`:

| Stage       | Registered                                             |
| ----------- | ------------------------------------------------------ |
| renderer    | `markdown`, then `html`                                |
| transformer | `tsumugu:heading-ids`, then `tsumugu:syntax-highlight` |
| theme       | `default`                                              |

Plus the conventions the CLI applies around it: the documentation root is
`./docs`, or the current directory when it contains an index document; the
server binds loopback; the root is watched and open pages reload after a
rebuild.

Nothing is discovered. No package is loaded because it happens to be installed,
no file is read to decide what to register, and no `@tsumugu/plugin-*` naming
convention means anything. If it is not in the table above, it is not running.

## The configuration API is the composition function

Core has no `defineConfig`. Composing a site _is_ calling `createSite` with the
stages you want:

```ts
import { createSite, serve } from "tsumugu-core";
import { createPreset } from "tsumugu-preset";

const site = await createSite({
  root: "/absolute/path/to/docs",
  ...createPreset(),
});
const server = await serve({
  site: () => site.result,
  assetRoot: "/absolute/path/to/docs",
});
```

A `defineConfig` helper would add a name, a document page and a compatibility
commitment while improving nothing: `createSite` is already typed, and its
options are already checked where they are written. `docs/designs/principles.md` asks a
new concept to justify itself, and this one could not.

### What core owns

The documentation root, the renderer registrations, the transformer
registrations, the selected theme, the site name and the page language. That is
the whole of `BuildOptions`, and it is deliberately the whole of it.

### What core does not own

Renderer options belong to the renderer, theme options to the theme,
transformer options to the transformer. `createHighlightTransformer({ lightTheme })`
is the highlighter's business and core never learns that the option exists.
Build output, search and AI exports are separate packages and will own their own
surfaces when they exist.

This is what stops a single configuration object from growing a field per
feature in the ecosystem.

## Changing the defaults

Every stage can be replaced, and the result is plain data:

```ts
// Markdown only, no highlighting, a different theme.
const preset = createPreset({
  renderers: [createMarkdownRenderer()],
  transformers: [createHeadingIdTransformer()],
  theme: myTheme,
});
```

To keep the defaults and add to them, spread them:

```ts
const preset = createPreset();
const site = await createSite({
  root,
  ...preset,
  transformers: [...preset.transformers, myTransformer],
});
```

Order is registration order, everywhere, and it is visible in the array you
wrote. Nothing sorts itself by a priority number.

## Building instead of serving

`tsumugu build [directory] --out dist --origin https://your.site` writes what
the server would have answered:

```text
dist/
├── index.html
├── guide/setup/index.html      the URL stays /guide/setup
├── documents.json  llms.txt  search.json  sitemap.xml
└── images/diagram.png
```

Clean URLs are deliberate: the published address is the one `tsumugu dev`
answered, so a link, an anchor or a bookmark cannot differ between the two.

The build refuses to write into a directory it did not create. Pass `--clean` if
you mean it. A directory from a previous build is emptied first, so a page you
deleted does not survive in the deployment.

Programmatically it is `buildStatic` from `tsumugu-build`, taking the same
composition as `createSite`.

## What a transformer may do

A transformer receives a Semantic AST and returns one. It cannot reach the
scanner, the router, the server or another transformer, and it has no lifecycle
hooks. That is the entire contract, and it is what keeps "add a transformer"
from meaning "run arbitrary code inside the pipeline".

See `packages/core/src/transformer/contract.ts` for the rules, and
`packages/transformer-highlight` for an official implementation.
