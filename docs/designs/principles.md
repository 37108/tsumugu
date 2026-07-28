# Design principles

These principles are the tests Tsumugu applies to features, APIs, and
dependencies. They describe practical boundaries, not product claims.

## Keep the core small

Core contains only what is needed to discover, normalize, process, render, and
serve documentation. Renderers, transformers, themes, and build tools can live
in their own packages. The boundaries remain useful only when they are enforced:
core must not turn into a home for every feature.

## Start without configuration

A directory of ordinary files should be enough to start the server. Routes come
from relative paths, while common behavior comes from stable defaults. A new
configuration field is justified only when a file-system convention or explicit
composition cannot express the requirement.

This does not remove control. Projects can register their own renderers,
transformers, and themes through the library API.

## Treat the file system as the source

Files are portable, versionable, and readable without Tsumugu. Routes therefore
follow source paths. Tsumugu does not silently strip numeric prefixes or map
`01-install.md` to `/install`.

The source should also outlive the tool. Ordinary content must not depend on a
Tsumugu-only Markdown dialect, database, content store, or framework component.

## Accept HTML as input

HTML is a durable source format, not just generated output. Tsumugu accepts full
documents and fragments. When the Semantic AST cannot represent a structure, it
preserves the source explicitly instead of dropping it or pretending that it
understood it.

## Generate human and machine output together

Pages, search data, structured document exports, and AI-oriented endpoints all
come from the same normalized document and Semantic AST. Maintaining a separate
tree for machine readers would let the two versions drift.

## Ship an accessible default

The official theme must work without custom CSS or a client framework. It
prioritizes semantic markup, keyboard access, visible focus, responsive layout,
and a small client-side runtime. An unstyled dump is not a useful default, and
React should not be required for basic reading.

## Keep editing fast

The scanner reports changes and the pipeline invalidates only the affected
work. Unchanged documents are not parsed or rendered again. Rebuilding every
page after every save is a correctness problem for the development workflow,
not an optimization to postpone.

## Prefer explicit composition

Renderers, transformers, and themes are registered in visible order. Tsumugu
does not scan `node_modules` for packages with a matching name or expose
unrestricted lifecycle hooks. A plugin composes the existing stages instead of
adding another runtime model.

Each stage has one job:

- renderers convert source formats to the Semantic AST;
- transformers map the AST to another AST;
- themes map semantic nodes to a virtual tree;
- serializers write HTML;
- servers deliver responses.

A Markdown renderer that also builds navigation or writes final pages crosses
these boundaries.

## Let packages own their options

Core owns core composition. Build, search, and AI packages own their own
settings. A central configuration object with one field per ecosystem feature
would couple unrelated packages.

## Earn public APIs

Every public export creates a compatibility commitment. New APIs begin as
internal implementations, are exercised by core or an official package, gather
usage evidence, and go through an RFC before they are treated as stable.
Exporting an internal type because it may be useful later is not enough.

The same rule applies to new concepts. A proposal for another abstraction,
lifecycle, or configuration layer must show why the existing stages cannot be
composed to solve the problem.
