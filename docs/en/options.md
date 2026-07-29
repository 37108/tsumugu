---
title: Options
description: Every command, command-line option, and front matter key Tsumugu understands, with defaults.
order: 2
---

# Options

Also in [日本語](/ja/options).

There is no configuration file ([ADR 5](/decisions/0005-no-configuration-file)).
Everything Tsumugu can be told is here: two commands, their options, and four
front matter keys.

## Commands

```bash
npx tsumugu dev [directory] [options]     # serve on localhost while you write
npx tsumugu build [directory] [options]   # write a static site to a directory
npx tsumugu --version
npx tsumugu --help
```

The directory is a positional argument, and `--root` is the same thing as a
flag. With neither, Tsumugu serves `./docs`, or the current directory if it
holds an index document. Unknown options are an error, not a guess.

## `dev`

| Option             | What it does                                                  | Default     |
| ------------------ | ------------------------------------------------------------- | ----------- |
| `--root <dir>`     | Directory to serve.                                           | `./docs`    |
| `--host <host>`    | Interface to bind.                                            | `127.0.0.1` |
| `--port <port>`    | Port to bind. `0` takes any free port.                        | `0`         |
| `--locales <tags>` | Comma-separated locale directories, each served as own scope. | none        |
| `--lang <tag>`     | Language of documents outside the locale directories.         | `en`        |
| `--trust`          | Let this root's content run as code.                          | off         |

Watching, rebuilding, and reloading open pages need no flag: `dev` always does
them. Live reload has none either — it is the one script Tsumugu adds to a page,
and a static build never contains it
([ADR 3](/decisions/0003-live-reload-script-policy)).

## `build`

| Option             | What it does                                                 | Default  |
| ------------------ | ------------------------------------------------------------ | -------- |
| `--root <dir>`     | Directory to build.                                          | `./docs` |
| `--out <dir>`      | Where to write the site.                                     | `./dist` |
| `--origin <url>`   | Origin the site is published under, for `sitemap.xml`.       | none     |
| `--base <path>`    | Path prefix the site is served under, e.g. `/my-repo`.       | `/`      |
| `--locales <tags>` | Comma-separated locale directories, each built as own scope. | none     |
| `--lang <tag>`     | Language of documents outside the locale directories.        | `en`     |
| `--clean`          | Delete `--out` even when Tsumugu did not write it.           | off      |
| `--trust`          | Let this root's content run as code.                         | off      |

Without `--clean`, Tsumugu refuses to erase a directory that is not its own
output, so a mistyped `--out` costs nothing.

## `--locales` and `--lang`

`--locales ja,en-US` names child directories of the root and gives each its own
scope: `/ja` and `/en-US` get separate navigation, search, `documents.json`, and
`llms.txt`, and neither lists the other's pages. Whatever stays at the root is
shared, and the root `sitemap.xml` covers everything.

Values are Unicode locale identifiers, canonicalized — `en-us` selects a
directory named `en-US`. A missing directory, or two values meaning the same
locale, stops the command before it serves or builds.

`--lang` applies to the shared scope only; a locale scope always uses its own
locale. [ADR 8](/decisions/0008-explicit-locale-scopes) has the reasoning, and
[How to Use](/en/how-to-use#separate-locales) has the directory layout.

## `--trust`

Off by default, never inferred. Without it, documentation is content: HTML
`<script>` is removed and MDX components are shown as source. With it, markup is
emitted as written, scripts run — inline ones by hash, files by `'self'`, never
an external origin — and `.mdx` executes while the page is built.

Pass it for a directory you wrote, and leave it off for anything else
([ADR 6](/decisions/0006-mdx-without-execution),
[ADR 7](/decisions/0007-operator-opt-in-trust)).

## Front matter

Four keys, and they are the whole option surface of a document.

```yaml
---
title: Setting up
description: One sentence.
order: 2
hidden: true
---
```

| Key           | Type    | What it does                           | When absent                      |
| ------------- | ------- | -------------------------------------- | -------------------------------- |
| `title`       | string  | Names the page in the sidebar and tab. | First heading, else the filename |
| `description` | string  | Summary in listings, search, llms.txt. | No summary                       |
| `order`       | number  | Position among siblings, ascending.    | After ordered siblings, by title |
| `hidden`      | boolean | Unlists the page.                      | Listed                           |

`hidden: true` takes the page out of navigation, search, `llms.txt`, and
`sitemap.xml`, and the URL still serves it. `documents.json` keeps it, flagged,
so a tool reading the project gets the truth.

A wrong type or a key Tsumugu does not know is a warning, never a refusal — the
page stays readable. `hiden` gets a warning naming the key you probably meant.

## Exit codes

| Code | Meaning                                                 |
| ---- | ------------------------------------------------------- |
| `0`  | Done.                                                   |
| `1`  | The command line made no sense. Retrying will not help. |
| `2`  | The command was fine; the server could not start.       |
