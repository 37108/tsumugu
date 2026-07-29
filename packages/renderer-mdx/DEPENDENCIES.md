# Why this package has the dependencies it has

Four runtime dependencies arrive with this package and nowhere else. They are
recorded here, against `CONTRIBUTING.md`'s dependency policy, because they are
the price of ADR 7's third phase and a future reader should be able to weigh it
without reconstructing the argument.

They reach a project only through `tsumugu`, which registers this renderer only
under `--trust`. `tsumugu-preset` does not import it, so composing the defaults
never pulls a compiler or a bundler into a project's graph.

## `@mdx-js/mdx`

- **Problem:** turning `.mdx` into JavaScript. It is the reference
  implementation of the format, and the format is what it says it is.
- **Alternatives:** writing an MDX compiler. The syntax is already parsed by
  `micromark-extension-mdxjs` (which `tsumugu-renderer-markdown` uses for the
  non-executing rendering), but producing a module from the tree is the part
  that would have to be invented, and inventing it would mean a second dialect.
- **Status:** maintained by the MDX project, the same organisation as the
  micromark extensions already here.
- **Cost:** shares the micromark and unified graph already installed for
  Markdown.
- **ESM and types:** ESM-only, types included.
- **Replacement:** contained. One `compile` call in `mdxPlugin`.

## `esbuild`

- **Problem:** resolving and bundling what a document imports, and compiling
  the `.jsx`/`.tsx` those imports are written in. Node cannot execute JSX, and
  the imports form a graph, not a file.
- **Alternatives:** the TypeScript compiler (much heavier, and still no
  bundling), or a hand-written resolver plus a JSX transform (a second module
  resolver to keep correct forever).
- **Status:** widely used, actively released, single vendor.
- **Cost:** the largest of the four — a platform binary. It is imported lazily,
  at the first document that actually executes, so a root with no `.mdx` never
  loads it, and its install script stays blocked (`pnpm-workspace.yaml`).
- **ESM and types:** ESM entry point, types included.
- **Replacement:** contained. One `build` call in `executeToHtml`, plus the
  resolution plugin that enforces the root boundary.

## `preact` and `preact-render-to-string`

- **Problem:** MDX output is JSX; something has to run it and produce HTML.
- **Alternatives:** React and `react-dom/server` (heavier, same job), or a
  minimal JSX runtime written here (would not run components that use hooks or
  context, which the MDX components people already have do use).
- **Status:** long-lived, actively maintained.
- **Cost:** small, and build-time only. No framework runtime is sent to a
  reader; the output is static HTML.
- **ESM and types:** ESM, types included.
- **Replacement:** contained. The JSX configuration in `executeToHtml` and the
  four-line entry module beside it.
