# Tsumugu

> A zero-config documentation server that turns plain HTML and Markdown files into a beautiful documentation experience for humans and AI.

**Status: Experimental / pre-alpha.** Nothing here is a stable API yet.

Tsumugu is a documentation server first. It treats the file system as the source of truth, keeps documentation portable as plain files, and aims for a small core with strong boundaries and composable extensions.

## Guiding principle

> Small core. Strong boundaries. Composable extensions.

## Try it

Point Tsumugu at a directory of Markdown or HTML files:

```bash
pnpm build
node packages/cli/dist/bin.js dev docs
```

It prints a localhost URL and serves the directory. With no argument it looks for `./docs`, then the current directory if that contains an index document.

What works today:

- Markdown and HTML sources, normalized into one Semantic AST;
- routes derived from file paths, with `index` files standing for their directory;
- a sidebar, table of contents and page shell built from the files that exist, with no sidebar configuration;
- heading anchors, front-matter `title`, `description`, `order` and `hidden`;
- a generated landing page when the root has no `index`, and a documentation-aware 404;
- documentation-local images and downloads, served without a way out of the root;
- diagnostics shown on the page they belong to, rather than only in the terminal;
- watch mode: saving a file rebuilds what changed and reloads the open page.

What is deliberately missing: search, static build output, syntax highlighting, configuration files, and any published API. See [the roadmap](docs/roadmap.md).

## Development

Requires Node.js 24 or newer. pnpm is pinned through the `packageManager` field.

```bash
pnpm install
pnpm check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full command list, [docs/architecture/overview.md](docs/architecture/overview.md) for the pipeline, and [docs/architecture/workspaces.md](docs/architecture/workspaces.md) for the workspace layout and dependency rules.
