# Examples

Two documentation projects, kept small enough to read in full and real enough to
break something.

| Example                  | What it shows                                                                   |
| ------------------------ | ------------------------------------------------------------------------------- |
| [`minimal/`](minimal/)   | the smallest thing that works: one Markdown file                                |
| [`handbook/`](handbook/) | nested sections, HTML alongside Markdown, front matter, an image, a hidden page |

Serve one:

```bash
pnpm build
node packages/cli/dist/bin.js dev examples/handbook
```

Or build it:

```bash
node packages/cli/dist/bin.js build examples/handbook --out /tmp/handbook --origin https://example.com
```

`tests/examples.test.ts` serves both on every run and fails if either produces a
diagnostic, so an example that stops working is a failing test rather than a
surprise for the next person who opens it.
