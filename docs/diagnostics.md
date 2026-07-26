# Diagnostics

## Why diagnostics are values

A documentation tool meets recoverable problems constantly: unparsable front
matter, a construct it cannot represent, a route two files both want, a link to
a page that does not exist.

Writing those to the console makes them impossible to test, aggregate, sort or
render into a page. So every stage **returns** diagnostics, and nothing in the
pipeline logs. The CLI formats them as text; a theme renders the same fields as
HTML. Neither presentation is mentioned in the model.

Diagnostics are not a replacement for assertions. A broken internal invariant is
a bug in Tsumugu and should throw; a diagnostic describes something about the
user's project.

## Severity

Severity is measured by **blast radius**, not by how annoying the problem is.

| Severity  | Meaning                          | Consequence                                                                                                          |
| --------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `warning` | the document is still usable     | it is served, with the problem reported                                                                              |
| `error`   | this document cannot be produced | the rest of the project still can; the document survives as a record so the failure can be explained on its own page |
| `fatal`   | nothing can be produced          | the process reports and stops — there is no partial result worth showing                                             |

There is exactly one fatal condition today: the documentation root cannot be
read. Everything else is scoped to a document or narrower.

## Shape

| Field        | Required | Purpose                                               |
| ------------ | -------- | ----------------------------------------------------- |
| `code`       | yes      | stable identifier, `stage/kebab-case`                 |
| `severity`   | yes      | `warning`, `error`, `fatal`                           |
| `message`    | yes      | what went wrong, in a sentence an author can act on   |
| `hint`       | no       | what to do about it, when there is a concrete answer  |
| `sourcePath` | no       | which file                                            |
| `range`      | no       | where in that file, when a parser reported a position |
| `stage`      | no       | which stage produced it                               |
| `cause`      | no       | the underlying thrown error                           |
| `related`    | no       | other locations that help explain it                  |

**Match on `code`, never on `message`.** Messages are for humans and may be
reworded or eventually translated; codes are the contract.

`hint` is separate from `message` so a presentation can show it differently, and
so messages are not padded with advice when there is none to give.

`cause` is kept so a stack trace stays reachable while debugging. It is
deliberately **not** part of a diagnostic's identity — two reports of one
problem are one problem, whichever exception object produced them.

## Ordering and deduplication

`sortDiagnostics` orders worst first, then by file, then by position within the
file, then by code and message.

Stages may run concurrently, so arrival order depends on scheduling. Sorting
means the same project always produces the same list, which is what makes the
output diffable and the tests meaningful. Position ordering serves the workflow
that follows "what is wrong": working down a file fixing things.

`dedupeDiagnostics` removes repeats. The same underlying problem is often
noticed by more than one stage — a file that cannot be parsed fails to render
and then fails to route. Identity excludes `cause`, `hint` and `related`,
because those explain a problem rather than distinguish one.

## Codes

Every code in the implementation appears here.
`tests/diagnostic-codes.test.ts` fails if one does not.

### `document/`

| Code                           | Severity | When                                                                                                             |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `document/invalid-source-path` | error    | a path cannot be represented — absolute, or escaping the documentation root                                      |
| `document/unsupported-format`  | warning  | no renderer handles the extension; images and licences hit this constantly, so it is not reported by the scanner |

### `scanner/`

| Code                      | Severity  | When                                                                                                  |
| ------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `scanner/root-unreadable` | **fatal** | the documentation root does not exist or cannot be read                                               |
| `scanner/unreadable`      | warning   | a subdirectory cannot be read; its contents are missing from the scan and everything else still works |
| `scanner/symlink-skipped` | warning   | a symbolic link was not followed, because one can point outside the root                              |

### `cache/`

| Code               | Severity | When                                                                                       |
| ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `cache/unreadable` | error    | a file could not be read for a reason other than being gone; the last good version is kept |

### `routing/`

| Code                | Severity | When                                    |
| ------------------- | -------- | --------------------------------------- |
| `routing/collision` | error    | two or more files map to the same route |

### `metadata/`

| Code                           | Severity | When                                                                  |
| ------------------------------ | -------- | --------------------------------------------------------------------- |
| `metadata/invalid-title`       | warning  | `title` is not text; the next fallback is used                        |
| `metadata/invalid-description` | warning  | `description` is not text; it is omitted                              |
| `metadata/invalid-order`       | warning  | `order` is not a finite number; the page is ordered as if it had none |
| `metadata/invalid-hidden`      | warning  | `hidden` is not a boolean; the page stays visible                     |

### `renderer/`

| Code                    | Severity | When                                              |
| ----------------------- | -------- | ------------------------------------------------- |
| `renderer/none`         | error    | no registered renderer claims the document        |
| `renderer/ambiguous`    | error    | more than one renderer claims it                  |
| `renderer/duplicate-id` | error    | two renderers share an id                         |
| `renderer/threw`        | error    | a renderer threw; the original is kept as `cause` |

### `serializer/`

| Code                      | Severity | When                                                                                              |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `serializer/invalid-node` | error    | a virtual node could not be serialized safely; it is skipped rather than emitted as broken markup |

### `theme/`

| Code                     | Severity | When                                                                                   |
| ------------------------ | -------- | -------------------------------------------------------------------------------------- |
| `theme/missing-renderer` | warning  | the theme has no renderer for a node type; its content is shown without presentation   |
| `theme/renderer-threw`   | error    | a node renderer threw; that node loses its presentation, the rest of the page survives |
| `theme/unsupported-node` | warning  | a renderer could not represent some source; it is shown as preformatted text           |

### `renderer-markdown/`

| Code                                           | Severity | When                                                                                |
| ---------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `renderer-markdown/unsupported-construct`      | warning  | Markdown the Semantic AST cannot represent yet; the source is kept and shown        |
| `renderer-markdown/invalid-front-matter`       | warning  | the front matter is not valid YAML, or is not a mapping; the document still renders |
| `renderer-markdown/unsupported-metadata-value` | warning  | a front-matter value has no metadata representation, such as a date or nested map   |

## Formatting

`formatDiagnostic` produces plain text in the compiler convention that editors
and humans already read:

```text
docs/guide.md:12:3: error routing/collision — "docs/guide.md" maps to "/guide", and so do 1 other file(s).
  hint: Rename or move one of them. Which page is served would otherwise depend on the order the files happened to be scanned.
  see also: docs/guide/index.md: also maps to "/guide"
```

**No colour, no symbols, no escape codes.** Those belong to whatever is
displaying the diagnostic; baking them in would make the same function useless
in a browser, a log file or a test assertion.

## Adding a code

1. Name it `stage/kebab-case`, describing the problem rather than the fix.
2. Pick severity by blast radius, using the table above.
3. Write a message an author can act on, and a `hint` only if there is a
   concrete answer.
4. Attach `sourcePath`, `range` and `stage` when they are known.
5. Preserve `cause` when converting a thrown error.
6. Add it to this document — a test fails otherwise.
