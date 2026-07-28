# Semantic Document AST

## Status

Version 0, internal. Implemented in `packages/core/src/ast/`, exported from
nothing. It will not become a public API until renderers and a theme have used
it and shown which parts were right.

## What it is for

This is the boundary where Markdown and HTML stop being different things.
Renderers produce it, transformers rewrite it, themes read it, and everything
downstream — navigation, tables of contents, search, link checking, the
machine-readable exports — reads this rather than a parser's output.

Two failure modes shaped the design.

A tree that mirrors the browser DOM ties the architecture to HTML, and Markdown
has to be flattened into it. A tree that mirrors one Markdown parser ties it to
that parser, and HTML has to be flattened instead. Either way the second format
becomes a second-class input, which contradicts
[HTML being a first-class input](../principles.md).

So nodes describe what a piece of a document **means**, never how a browser lays
it out. There is no `div`, no `span`, no `br`, no `section`. A theme owns
presentation; the AST owns meaning.

## Structure

Every node has a `type` discriminant. The union is exhaustive, so a consumer can
`switch` over it with no `default` branch and the compiler will report any node
it forgot when a new one is added. That guarantee is what makes it safe to grow
the node set later.

Children are typed by position rather than left open:

- **Block nodes** stand on their own in a document's flow.
- **Inline nodes** appear within a line of prose.

A paragraph's children are inline; a document's children are block. A list item
holds **blocks**, not inlines — that is what makes a nested list, or a code
block inside a list, representable at all.

`raw-html` and `unsupported` appear in both unions and carry a `placement` field
saying which position they are in, because preserved source can be either.

## Node reference

Every node may carry an optional `range` (`{ start, end }` of
`{ line, column, offset }`). It is optional because not every parser tracks
positions and a node synthesised by a transformer has no source; diagnostics
degrade to file-level rather than becoming impossible.

| Node             | Required                       | Optional   | Children     |
| ---------------- | ------------------------------ | ---------- | ------------ |
| `document`       | —                              | —          | block        |
| `heading`        | `depth` (1–6)                  | —          | inline       |
| `paragraph`      | —                              | —          | inline       |
| `text`           | `value`                        | —          | leaf         |
| `emphasis`       | —                              | —          | inline       |
| `strong`         | —                              | —          | inline       |
| `inline-code`    | `value`                        | —          | leaf         |
| `code-block`     | `value`                        | `language` | leaf         |
| `list`           | `ordered`                      | `start`    | `list-item`  |
| `list-item`      | —                              | —          | block        |
| `link`           | `url`                          | `title`    | inline       |
| `image`          | `url`, `alt`                   | `title`    | leaf         |
| `blockquote`     | —                              | —          | block        |
| `thematic-break` | —                              | —          | leaf         |
| `table`          | `align`                        | —          | `table-row`  |
| `table-row`      | `header`                       | —          | `table-cell` |
| `table-cell`     | —                              | —          | inline       |
| `raw-html`       | `value`, `trust`, `placement`  | —          | leaf         |
| `unsupported`    | `reason`, `value`, `placement` | —          | leaf         |

Several fields are worth the explanation:

**`heading.depth`** is the document's outline level, not a font size. It is what
navigation, the table of contents and assistive technology depend on.

**`image.alt` is required**, and an empty string is meaningful — it marks the
image decorative. Making it optional would let a renderer omit it by accident,
which is the single most common accessibility failure in generated
documentation.

**`link.url` is whatever the author wrote.** Resolving relative links and
rejecting dangerous URL schemes happen later, deliberately: a node that silently
dropped a link would hide the problem from the diagnostics that should report
it.

**`code-block.language`** is unnormalized, as written. Highlighting is a
transformer's job; this only records what the document said.

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

Three, because three pieces of knowledge would otherwise be restated everywhere:

- `childrenOf(node)` — the children of any node, or an empty list. Centralised
  so traversal, validation and transformers do not each re-encode which nodes
  have children.
- `visit(root, visitor)` — depth-first in document order, which is what a table
  of contents, a heading outline and a search index all need. Returning
  `"skip"` leaves a subtree unvisited. Ancestors are passed nearest-first.
- `textContent(node)` — the readable text of a subtree, used by heading
  identifiers, table-of-contents entries and search extracts.

There are deliberately no construction helpers. Object literals with the node
types are already checked by the compiler, and a builder API would be a public
surface to maintain before anything has asked for one.

## Validation

`findNodeProblems(root)` reports structural invariants the type system cannot
express: heading depth in range, a start number only on an ordered list, every
table row matching the declared column count, alternative text present, a link
having a destination.

These are the mistakes a renderer actually makes, because a renderer assembles
nodes from untyped parser output, and they surface far from their cause — a
malformed tree becomes a confusing theme failure three stages later. All
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
  because an input parser emits a matching token. Footnotes, definition lists
  and admonitions are all plausible; none of them are here yet, and each needs a
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
