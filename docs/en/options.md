---
title: Options
description: Every command, command-line option, and front matter key Tsumugu understands, with defaults.
order: 2
---

# Options

Also in [日本語](/ja/options).

There is no configuration file and no environment variable to set
([ADR 5](/decisions/0005-no-configuration-file)). Everything Tsumugu can be
told is on this page: two commands, their options, and the four front matter
keys a document may carry.

## Commands

```bash
npx tsumugu dev [directory] [options]     # serve on localhost while you write
npx tsumugu build [directory] [options]   # write a static site to a directory
npx tsumugu --version                     # print the version
npx tsumugu --help                        # print the same list, shorter
```

An unknown option is an error rather than a guess, and the message names the
options that command accepts. `--locales` and `--lang` may each appear once.

## Which directory gets served

The directory is a positional argument — `tsumugu dev docs` — and `--root docs`
is the same thing spelled as a flag. With neither, Tsumugu looks for one, in
this order:

1. `./docs`, if it exists. The convention most repositories already follow.
2. The working directory, but only if it contains an index document
   (`index.md`, `index.markdown`, `index.html`, or `index.htm`).

If neither is there, the command stops and says what to do instead. A working
directory with no index is far more likely to be a project root than a
documentation root, and serving it would sweep up every stray Markdown file in
the repository.

## Options for `dev`

| Option             | What it does                                                   | Default     |
| ------------------ | -------------------------------------------------------------- | ----------- |
| `--root <dir>`     | Directory to serve. The same as the positional argument.       | discovered  |
| `--host <host>`    | Interface to bind. Loopback unless you say otherwise.          | `127.0.0.1` |
| `--port <port>`    | Port to bind. `0` takes any free port, and the URL is printed. | `0`         |
| `--locales <tags>` | Comma-separated locale directories served as separate scopes.  | none        |
| `--lang <tag>`     | HTML language for documents outside the locale directories.    | `en`        |
| `--trust`          | Declare this root's content yours, so it may run as code.      | off         |

Watch mode has no flag: `dev` always watches the root, rebuilds only what
changed, and reloads open pages. If a rebuild fails, the last good version keeps
being served. Live reload has no flag either — it is the one script Tsumugu adds
to a page, and a static build never contains it
([ADR 3](/decisions/0003-live-reload-script-policy)).

## Options for `build`

| Option             | What it does                                                                          | Default    |
| ------------------ | ------------------------------------------------------------------------------------- | ---------- |
| `--root <dir>`     | Directory to build. The same as the positional argument.                              | discovered |
| `--out <dir>`      | Where to write the site.                                                              | `./dist`   |
| `--origin <url>`   | Absolute origin the site will be published under, used by `sitemap.xml`.              | none       |
| `--base <path>`    | Path prefix the site is served under, e.g. `/my-repo` on a GitHub Pages project site. | `/`        |
| `--locales <tags>` | Comma-separated locale directories built as separate scopes.                          | none       |
| `--lang <tag>`     | HTML language for documents outside the locale directories.                           | `en`       |
| `--clean`          | Remove the output directory even when Tsumugu did not write it.                       | off        |
| `--trust`          | Declare this root's content yours, so it may run as code.                             | off        |

Without `--clean`, Tsumugu refuses to erase a directory it does not recognize as
its own output, so pointing `--out` at the wrong path costs you nothing.
`--base` is normalized to one leading slash and no trailing one, so `/my-repo`,
`my-repo/`, and `//my-repo` all mean the same thing.

## `--locales` and `--lang`

`--locales ja,en-US` names direct child directories of the root and turns each
into its own scope: `/ja` and `/en-US` get their own navigation, search,
`documents.json`, and `llms.txt`, and neither shows the other's pages. What is
left at the root stays shared. The root `sitemap.xml` covers the whole site.

Values are Unicode locale identifiers and are canonicalized, so `en-us` selects
a directory named `en-US`. The command stops before serving or building if a
named directory is missing, or if two values canonicalize to the same locale —
a typo does not become a silently empty section.

`--lang` sets the HTML language of the shared scope only. Each locale scope uses
its own locale, whatever `--lang` says. The reasoning is in
[ADR 8](/decisions/0008-explicit-locale-scopes), and
[How to Use](/en/how-to-use#separate-locales) shows the directory layout.

## `--trust`

Off by default, and never inferred. Without it, documentation is content: HTML
`<script>` is removed, and MDX expressions and components are shown as source.
With it, you are declaring the directory is yours, and Tsumugu emits markup as
written, runs its scripts — inline ones allowed by hash, files by `'self'`,
never an external origin — and executes `.mdx` while the page is built.

Leave it off for anything you did not write. Both halves of the reasoning are
recorded: [ADR 6](/decisions/0006-mdx-without-execution) for why content does
not run, [ADR 7](/decisions/0007-operator-opt-in-trust) for why one flag is the
whole of the setting.

## Front matter, per document

Front matter is the entire option surface of a document. Four keys:

```yaml
---
title: Setting up # otherwise the first heading, then the file name
description: One sentence. # shown in listings, search, and llms.txt
order: 2 # sidebar position among siblings; unordered pages follow, by title
hidden: true # unlisted, but still served at its own URL
---
```

| Key           | Type    | Effect when absent                                     |
| ------------- | ------- | ------------------------------------------------------ |
| `title`       | string  | The first level-one heading, or else the file name.    |
| `description` | string  | No summary in listings, search results, or `llms.txt`. |
| `order`       | number  | Sorted after ordered siblings, by title.               |
| `hidden`      | boolean | The page is listed everywhere it belongs.              |

`hidden: true` takes the page out of navigation, search, `llms.txt`, and
`sitemap.xml`, and the URL still serves it — an unlisted page, not a private one.
`documents.json` is the exception on purpose: it carries the page with
`hidden: true` on it, because a tool asking what the project contains should get
the truth and decide for itself.

A key Tsumugu does not know is left alone rather than rejected — it is you
saying something Tsumugu has no feature for yet. A near miss like `hiden` gets a
warning naming the key you probably meant. A wrong type, such as `order: nope`,
is also a warning: the page is still readable, and refusing to serve it would
punish a reader for an author's typo.

## Exit codes

| Code | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| `0`  | Done. `--help` and `--version` end here too.                |
| `1`  | The command line could not be understood. Edit the command. |
| `2`  | The command was valid, but the server could not start.      |

They are fixed so a script can branch on them: `1` will never succeed on a
retry, `2` might.
