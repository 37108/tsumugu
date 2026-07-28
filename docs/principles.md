# Design Principles

Tsumugu is guided by a small set of durable principles. They are not marketing statements. They are constraints used to evaluate features, APIs, dependencies, and implementation choices.

## Small core. Strong boundaries. Composable extensions.

This is the project's primary architectural rule.

The core should contain only the concepts required to discover, normalize, process, render, and serve documentation. Features that can live in separate packages should not become permanent core responsibilities.

Strong boundaries make internal evolution possible. Composition makes extension possible without an unrestricted runtime hook system.

## Zero configuration, not zero power

### Why

A user should be able to place ordinary files in `docs/` and start the server without first learning a configuration language.

### Consequence

Configuration is optional. Common behavior comes from predictable defaults and conventions. Advanced users may compose renderers, transformers, and themes explicitly.

### Counterexample

Requiring every project to register Markdown, define routes, and configure a theme before the first page can be viewed.

## Convention over configuration

### Why

Every configuration field becomes documentation, compatibility, validation, migration, and support work.

### Consequence

Before adding configuration, determine whether a file-system convention can express the behavior clearly.

### Counterexample

Adding route aliases for ordinary file paths when predictable path-to-route mapping is sufficient.

## File system first

### Why

The file system is visible, portable, versionable, and understandable without Tsumugu.

### Consequence

Routes reflect relative source paths. Tsumugu does not silently remove numeric prefixes or aggressively rewrite names.

### Counterexample

Mapping `01-install.md` to `/install` without an explicit user decision.

## Plain files forever

### Why

Documentation must survive the tool that presents it.

### Consequence

Tsumugu avoids mandatory proprietary syntax, databases, custom content stores, and framework-specific source components.

### Counterexample

Requiring a Tsumugu-only Markdown dialect for headings, links, navigation, or ordinary content.

## HTML is a first-class input

### Why

HTML is a durable documentation format and should not be treated only as generated output.

### Consequence

Full HTML documents and HTML fragments are accepted as source formats. Unsupported structure may require an explicit preserved-HTML node rather than silent data loss.

### Counterexample

Forcing users to convert existing HTML documentation to Markdown.

## Human and AI from one source

### Why

Separate human and machine documentation inevitably diverge.

### Consequence

Human pages, search data, structured document exports, and AI-oriented endpoints should derive from the same normalized Document and Semantic AST.

### Counterexample

Maintaining a second AI-specific documentation tree.

## Beautiful and accessible by default

### Why

A zero-config tool must provide a useful result without requiring custom CSS or a client framework.

### Consequence

The official theme prioritizes typography, semantics, keyboard access, visible focus, responsive layout, and low client-side runtime cost.

### Counterexample

Shipping an unstyled HTML dump or requiring React for basic reading.

## Fast by design

### Why

Development feedback is part of the product experience.

### Consequence

The scanner emits changes, the pipeline performs incremental invalidation, and unchanged documents are not repeatedly parsed or rendered.

### Counterexample

Rebuilding every page after every file edit.

## Explicit composition over hidden magic

### Why

Implicit discovery and global lifecycle hooks are difficult to debug, secure, order, and evolve.

### Consequence

Renderers, transformers, and themes are registered explicitly. A plugin is a package that composes those concepts rather than introducing a second runtime model.

### Counterexample

Automatically loading every package matching `tsumugu-plugin-*` from `node_modules`.

## One job per stage

### Why

Clear responsibilities improve testing, caching, diagnostics, and replaceability.

### Consequence

Renderers parse sources into Semantic AST. Transformers map AST to AST. Themes map semantic nodes to a virtual tree. Serializers produce HTML. Servers deliver responses.

### Counterexample

A Markdown renderer that also builds the sidebar, applies the page theme, and writes final HTML files.

## Every package owns its configuration

### Why

A central configuration object becomes coupled to every feature in the ecosystem.

### Consequence

Core owns core composition. Build, search, and AI packages own their own configuration surfaces.

### Counterexample

Adding build output, search indexing, and AI export options to `defineConfig()` in core.

## Public APIs are earned

### Why

Every public export is a long-term compatibility commitment.

### Consequence

New APIs begin as internal implementations, are validated by core or official packages, gather real usage evidence, and graduate through an RFC.

### Counterexample

Exporting an internal AST type because it might be useful to third parties later.

## New concepts must justify their existence

### Why

Architecture degrades when every feature introduces a new abstraction, lifecycle, or configuration layer.

### Consequence

Proposals must explain why existing concepts cannot be composed to solve the problem.

### Counterexample

Adding a generic event bus when an ordered transformer pipeline is sufficient.
