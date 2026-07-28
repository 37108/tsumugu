---
title: Testing
order: 4
---

# Testing

## Why a strategy at all

Tsumugu's architecture is a chain of boundaries: scanner, document, renderer,
transformer, theme, serializer, router, server. If every change were validated
by running the whole system, the suite would get slow enough that people stop
running it, and a failure would not say which boundary broke.

The layers below exist so that a change is validated by the cheapest test that
can actually catch its failure mode.

This document describes what exists today. The document pipeline is not
implemented yet, so the layers are defined and only partly populated.

## Layers

| Layer       | Answers                                         | Location                      | Speed   |
| ----------- | ----------------------------------------------- | ----------------------------- | ------- |
| Unit        | does this function behave?                      | `packages/*/src/**/*.test.ts` | instant |
| Contract    | does this implementation satisfy the interface? | `packages/*/src/**/*.test.ts` | instant |
| Integration | do these stages work together?                  | `tests/*.test.ts`             | fast    |
| Fixture     | does real input parse and render correctly?     | `tests/` with fixture trees   | fast    |
| End-to-end  | does the shipped artifact work?                 | `tests/*.test.ts`             | slow    |

**Unit tests** cover pure functions: path normalization, AST shaping, metadata
resolution, routing. They are colocated with the source they cover, so a reader
opening a file can see its tests beside it and a package can be reasoned about
on its own.

**Contract tests** will cover the renderer, transformer, theme and serializer
interfaces once those exist. A contract test is written against the interface
and run against each implementation, so a new renderer inherits the suite
instead of restating it.

**Integration tests** cover several stages from file discovery through a
rendered response. They live in `tests/` because they do not belong to any
single package.

**Fixture tests** use real Markdown, HTML, metadata, malformed input and
awkward paths written to a temporary directory. Fixtures are small and named
after the behaviour they verify, not after the file type.

**End-to-end tests** run the compiled artifact. `tests/cli.test.ts` executes
`packages/cli/dist/bin.js` in a child process; it is the only test that proves
the build, the ESM output, the shebang and the `bin` entry actually work.
End-to-end tests are the most expensive to run and the most annoying to debug,
so they cover user-visible workflows and nothing else.

## Conventions

**Naming.** Test files end in `.test.ts`. A `describe` block names the unit
under test. An `it` block states the behaviour as a sentence, such as `it("removes the
directory even when the callback throws")`, not `it("works")`.

**Location.** Colocated for anything owned by one package; `tests/` for anything
that spans packages or tests the repository itself.

**Helpers.** Shared support code lives in `tests/helpers/` and is not matched by
the test glob, so a helper is never mistaken for a suite. Helpers have their own
tests: a broken helper produces confusing failures everywhere it is used.

**No network access.** Tests never reach the network. A test that depends on a
remote host is not testing Tsumugu, and it fails for reasons unrelated to the
change being reviewed.

**Determinism.** Anything with a platform-dependent or arbitrary order is sorted
before it is asserted on. `listFiles` sorts, and workspace discovery sorts,
because directory order is chosen by the file system and differs between runs
and platforms.

## File-system tests

Tsumugu reads the file system, so most behaviour can only be tested against real
files. `tests/helpers/temporary-directory.ts` provides the tools:

```ts
await withTemporaryDirectory(async (directory) => {
  await writeFiles(directory, {
    "docs/index.md": "# Index\n",
    "docs/guide/setup.md": "# Setup\n",
  });

  expect(await listFiles(directory)).toEqual([
    "docs/guide/setup.md",
    "docs/index.md",
  ]);
});
```

- `withTemporaryDirectory` creates a unique directory with `mkdtemp` and removes
  it in a `finally` block, so **cleanup happens even when the test fails**. A
  test that leaks directories on failure fills the machine of whoever is already
  debugging a failure.
- `writeFiles` takes POSIX-style keys and joins them with the host separator, so
  one fixture literal is correct on Linux, macOS and Windows.
- `listFiles` returns sorted, POSIX-style relative paths.

Never build paths by concatenating strings with `/`. Use `path.join`, and pass
the result through `toPosixPath` before asserting on it.

## Snapshots

Snapshots are allowed only for output a human would read and review: rendered
HTML, a formatted diagnostic, a generated navigation tree. For those, a snapshot
diff is genuinely easier to review than a pile of assertions.

Snapshots are **not** for internal data structures, object dumps, or anything a
reviewer would approve without reading. A snapshot nobody reads records a bug as
readily as it records correct behaviour.

There are no snapshot files yet.

## Coverage

```bash
pnpm test:coverage
```

Reports go to `coverage/`: text in the terminal, `lcov.info` for tooling, and an
HTML report to read locally. The directory is ignored by Git, Prettier and
ESLint.

**No global threshold is enforced,** and none should be added yet. Before the
document pipeline exists, a percentage would measure how much code exists rather
than how well it is tested, and it would reward writing tests for trivial code
over hard code.

Coverage is measured on **source files**, but a cross-package import resolves
through the dependency's built `dist/`. So a test in `tsumugu` that imports
`tsumugu-core` does not attribute coverage to `packages/core/src`. This is why
`tsumugu-core` currently reports zero: its single export is exercised only
through the compiled CLI. Test a package's code from inside that package, and
the numbers stay meaningful.

## Commands

| Command              | Use                                                 |
| -------------------- | --------------------------------------------------- |
| `pnpm test`          | build, then run everything once                     |
| `pnpm test:watch`    | build, then re-run affected tests as files change   |
| `pnpm test:coverage` | build, then run everything with coverage            |
| `pnpm check`         | formatting, linting, types and tests; the full gate |

All of them build first, because `tests/cli.test.ts` runs real build output.
`tsc --build` is incremental, so this is cheap after the first run.

To run one file or one package:

```bash
pnpm exec vitest run tests/workspace.test.ts
pnpm exec vitest run packages/cli
```

## Adding a test

1. Pick the cheapest layer that can catch the failure. Prefer unit over
   integration, and integration over end-to-end.
2. Put it beside the code if one package owns it, in `tests/` otherwise.
3. Assert on observable behaviour, not on private structure. A test that breaks
   during a refactor without any behaviour changing is a cost, not a safety net.
4. If it touches the file system, use `withTemporaryDirectory`.
5. Check that it fails when the behaviour is wrong. A test that passes against
   broken code is worse than no test, because it is trusted.
