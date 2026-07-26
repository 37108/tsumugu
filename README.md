# Tsumugu

> A zero-config documentation server that turns plain HTML and Markdown files into a beautiful documentation experience for humans and AI.

**Status: Experimental / pre-alpha.**

Tsumugu is a documentation server first. It treats the file system as the source of truth, keeps documentation portable as plain files, and aims for a small core with strong boundaries and composable extensions.

## Guiding principle

> Small core. Strong boundaries. Composable extensions.

The repository is currently being bootstrapped. The workspace, build, and test foundation is in place; the document pipeline described in [the architecture overview](docs/architecture/overview.md) is not implemented yet.

## Development

Requires Node.js 24 or newer. pnpm is pinned through the `packageManager` field.

```bash
pnpm install
pnpm check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full command list and [docs/architecture/workspaces.md](docs/architecture/workspaces.md) for the workspace layout and dependency rules.
