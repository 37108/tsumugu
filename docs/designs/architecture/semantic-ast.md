# Semantic document AST

## Status

Version 0, internal. Implemented in `packages/core/src/ast/`, exported from
nothing. It will not become a public API until renderers and a theme have used
it and shown which parts were right.

## What it is for

This is the boundary where Markdown and HTML stop being different things.
Renderers produce it, transformers rewrite it, and themes read it. Navigation,
tables of contents, search, link checking, and machine-readable exports all use
this tree instead of a parser's output.

Two failure modes shaped the design.

A tree that mirrors the browser DOM ties the architecture to HTML, and Markdown
has to be flattened into it. A tree that mirrors one Markdown parser ties it to
that parser, and HTML has to be flattened instead. Either way the second format
becomes a second-class input, which contradicts
[HTML being a first-class input](../principles.md).

So nodes describe what a piece of a document **means**, never how a browser lays
it out. There is no `div`, no `span`, no `br`, no `section`. A theme owns
presentation. The AST owns meaning.

## Structure

Every node has a `type` discriminant. The union is exhaustive, so a consumer can
`switch` over it with no `default` branch and the compiler will report any node
it forgot when a new one is added. That guarantee is what makes it safe to grow
the node set later.

Children are typed by position rather than left open:

- **Block nodes** stand on their own in a document's flow.
- **Inline nodes** appear within a line of prose.

A paragraph's children are inline, while a document's children are block. A
list item holds block nodes so it can contain a nested list or code block.

`raw-html` and `unsupported` appear in both unions and carry a `placement` field
saying which position they are in, because preserved source can be either.

## Node reference

Every node may carry an optional `range` (`{ start, end }` of
`{ line, column, offset }`). It is optional because not every parser tracks
positions, and a node synthesised by a transformer has no source. Diagnostics
degrade to file-level rather than becoming impossible.

| Node             | Required                       | Optional   | Children     |
| ---------------- | ------------------------------ | ---------- | ------------ |
| `document`       | none                           | none       | block        |
| `heading`        | `depth` (1-6)                  | none       | inline       |
| `paragraph`      | none                           | none       | inline       |
| `text`           | `value`                        | none       | leaf         |
| `emphasis`       | none                           | none       | inline       |
| `strong`         | none                           | none       | inline       |
| `inline-code`    | `value`                        | none       | leaf         |
| `code-block`     | `value`                        | `language` | leaf         |
| `list`           | `ordered`                      | `start`    | `list-item`  |
| `list-item`      | none                           | none       | block        |
| `link`           | `url`                          | `title`    | inline       |
| `image`          | `url`, `alt`                   | `title`    | leaf         |
| `blockquote`     | none                           | none       | block        |
| `thematic-break` | none                           | none       | leaf         |
| `table`          | `align`                        | none       | `table-row`  |
| `table-row`      | `header`                       | none       | `table-cell` |
| `table-cell`     | none                           | none       | inline       |
| `raw-html`       | `value`, `trust`, `placement`  | none       | leaf         |
| `unsupported`    | `reason`, `value`, `placement` | none       | leaf         |

Several fields are worth the explanation:

**`heading.depth`** is the document's outline level, not a font size. It is what
navigation, the table of contents and assistive technology depend on.

**`image.alt` is required.** An empty string marks a decorative image. Making
the field optional would let a renderer omit it by accident,
which is the single most common accessibility failure in generated
documentation.

**`link.url` is whatever the author wrote.** Resolving relative links and
rejecting dangerous URL schemes happen later. A node that silently
dropped a link would hide the problem from the diagnostics that should report
it.

**`code-block.language`** is unnormalized, as written. Highlighting is a
transformer's job. This field only records what the document said.

**`table-row.header`** is document meaning rather than a `thead` wrapper,
because it is what a screen reader and a data export both need, independently of
how it is marked up.

## The two escape hatches

### `raw-html`

HTML is a first-class input and some of it cannot be represented as meaning
without losing something. Rather than dropping it, it is carried through as
source text.

**Everything in this node is untrusted.** It was authored in a documentation
file, which is content, not application code. The `trust` field is always
`"untrusted"` today: only documentation-authored markup ever becomes an AST
node, and a theme's own markup is a Virtual Tree instead. The field exists so a
consumer has to acknowledge the distinction rather than infer it from the node's
name.

The serializer decides what may actually be emitted. Nothing here may be assumed
safe to inject into the page shell. See [`SECURITY.md`](https://github.com/37108/tsumugu/blob/main/SECURITY.md).

`textContent()` deliberately skips these nodes: their text is unparsed and
untrusted, so counting it would put markup into a heading identifier or a search
snippet.

### `unsupported`

A construct the AST has no node for is a gap in Tsumugu, not a mistake by the
author. Dropping it would make the tool quietly lossy, so the original source
text is kept along with a `reason`. That lets the pipeline degrade gracefully,
lets a diagnostic point at something real, and lets a later version represent
the construct properly without the content having been lost in the meantime.

## Helpers

Three helpers keep node-shape knowledge in one place:

- `childrenOf(node)` returns the node's children or an empty list.
- `visit(root, visitor)` walks depth-first in document order. Returning
  `"skip"` leaves a subtree unvisited, and ancestors are passed nearest-first.
- `textContent(node)` returns the readable text used for heading identifiers,
  table-of-contents entries, and search extracts.

There are deliberately no construction helpers. Object literals with the node
types are already checked by the compiler, and a builder API would be a public
surface to maintain before anything has asked for one.

## Validation

`findNodeProblems(root)` reports structural invariants the type system cannot
express: heading depth in range, a start number only on an ordered list, every
table row matching the declared column count, alternative text present, a link
having a destination.

These are the mistakes a renderer actually makes because it assembles nodes
from untyped parser output. Without validation, a malformed tree becomes a
confusing theme failure three stages later. All
problems are collected rather than throwing on the first, since a renderer that
produces one bad node usually produces several.

It is a development and test aid. **It is not a security boundary**: the safety
of preserved raw markup is decided by the serializer.

## Forward compatibility

For internal consumers, during pre-alpha:

- **The node set will grow.** Because the union is exhaustive, a new node breaks
  every `switch` at compile time. That is the intended behaviour: it forces each
  consumer to decide what the new node means for it, rather than silently
  dropping it.
- **A new node must preserve meaning existing nodes cannot express.** Not
  because an input parser emits a matching token. Footnotes, definition lists,
  and admonitions are all plausible, but each needs a
  reason beyond "the parser has one".
- **Fields may become required.** Nothing here is a compatibility commitment
  yet.
- **`unsupported` is the pressure valve.** A renderer meeting something it
  cannot represent emits one rather than guessing at an approximation or
  dropping content.
- **Do not attach renderer-specific data to common nodes.** No node carries a
  parser's object, and none should. If a renderer needs to pass something
  through, that is a design discussion, not a field.

## What is not here

- The Virtual Tree, which is what a theme produces from these nodes.
- HTML serialization and escaping rules.
- Heading identifiers, link resolution and syntax highlighting, all of which are
  transformers operating on this tree.
- Every HTML element. The first version covers what documentation is made of.
