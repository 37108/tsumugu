---
description: How Tsumugu's packages are versioned, published, and what pre-alpha means for anyone depending on them.
---

# Releasing

## What is published

Everything under `packages/` is published to npm under the `@tsumugu` scope.
`internal/` workspaces never are: they are development tooling, and a consumer
installing a published package must never end up needing one.

`tests/workspace.test.ts` states the list of publishable packages explicitly, so
a workspace that became publishable by accident fails the suite rather than
appearing on the registry.

## One version for all of them

Every package moves together, on one version number, configured through
Changesets' `fixed` setting.

The packages are not independently useful yet. The CLI, the preset, the
renderers, the theme and the build adapter are one product split along
architectural lines. Independent versions would mean a matrix of
combinations nobody has tested. One version means "these were built and checked
together", which is the only claim currently worth making.

This is reconsidered when a package earns a reason to move on its own.

## Pre-alpha means 0.x

While the version starts with `0.`, **any release may break anything**. Public
APIs are earned, not declared: `docs/designs/principles.md` describes the path from
internal implementation to stable API, and nothing here has finished it.

A minor bump (`0.1.0` → `0.2.0`) is used for anything a consumer would notice; a
patch for fixes that do not change behaviour they could depend on. Neither is a
compatibility promise until the version reaches `1.0.0`.

## Breaking things on purpose

Pre-alpha earns the right to break, not the right to surprise. When a release
changes behaviour a consumer could have depended on:

- the changeset says **what breaks and what to do instead**, in the imperative
  ("rename `buildSite` to `createSite().result`"), because the changelog is the
  only migration guide a 0.x release gets;
- the bump is **minor**, never patch. `0.x` patches are safe by convention
  even where semver does not require it;
- diagnostic **codes** are part of the surface: a removed or renamed code is a
  breaking change, wording is not (`docs/designs/diagnostics.md` states this contract);
- where the old and new shape can coexist for one release, they do, and the old
  one says so in its documentation comment, but pre-alpha does not promise
  deprecation windows, and pretending otherwise would be a stability claim the
  version number contradicts.

There is no other announcement channel yet. The changelog is the communication,
which is one more reason changesets are written for the person upgrading rather
than the person who made the change.

## Making a change

```bash
pnpm changeset          # describe the change and choose the bump
```

That writes a Markdown file under `.changeset/`, which is reviewed with the code
it describes. A test, comment, or internal refactor that consumers cannot
observe needs no changeset.

## Publishing

The release workflow does both halves, and which one it does depends on what is
on `main`:

1. **With unreleased changesets**, it opens or updates a pull request titled
   `chore: version packages`, containing the version bumps and the changelog
   entries those changesets describe.
2. **When that pull request is merged**, it runs the full gate and publishes.

So publishing is a merge, reviewed like any other, rather than a command
somebody runs on a laptop at the end of a long day.

### Credentials

Publishing uses npm's trusted publishing: the workflow asks GitHub for a
short-lived token through `id-token: write`, and npm verifies it. There is no
`NPM_TOKEN` in repository secrets, because a long-lived token is a credential
that leaks once and works forever.

`NPM_CONFIG_PROVENANCE` is on, so each published package carries a signed
statement of the commit and workflow that built it.

### Before the first publish

The npm organisation must be configured to trust this repository's release
workflow. Until that is done the publish step fails with an authorization error,
which is the correct failure: nothing is published by accident.

### Before the first publish of a _new_ package

Trusted publishing verifies a publisher that was configured **on a package that
already exists**. A name the registry has never seen has no configuration to
check, so the publish fails with `404 Not Found - PUT`, not with an
authorization error. Adding a workspace is therefore two acts, and only the
second is automatic:

1. A maintainer publishes the new package once, by hand, from a machine
   authenticated to npm. This is what creates the name.
2. That package is configured on npmjs.com to trust this repository's release
   workflow, exactly as the others are. Every later version publishes itself.

Do step 1 **before** merging the version pull request that first releases the
package. Changesets publishes each package independently, so a missing name
does not stop the rest: the release succeeds for everything else and leaves
whatever depends on the new package pointing at a version nobody can install.

That is not hypothetical. On 2026-07-29, `0.4.0` shipped
`tsumugu-renderer-mdx` for the first time. Eight packages published, that one
404'd, and `tsumugu@0.4.0` — which depends on it — was uninstallable until the
name was created by hand. The release step reported the failure loudly and
correctly; nothing checked for it beforehand, which is why this section
exists.

### Reading a 404 from the registry

`404 Not Found - PUT` does not mean the registry is missing something. npm
answers an unauthorized publish of a name that does not exist with 404 rather
than 401, so that nobody can discover private names by watching status codes.
Two different problems therefore produce the identical error, and it is worth
knowing which one you have before changing anything:

- **Publishing by hand.** Check the credential first:
  `npm whoami --registry=https://registry.npmjs.org/`. A 401 there means the
  token is missing or expired — including when a default registry points
  somewhere else, because `npm login` without `--registry` authenticates
  against that other host and leaves npmjs.org untouched.
- **Publishing from the release workflow.** The credential is short-lived and
  comes from the trusted publisher configured on the package, so a 404 means
  the name has no such configuration: the two steps above have not been done.

## What a release checks

`pnpm run release` runs formatting, linting, type checking, and the full test
suite through `pnpm check`. `tests/packaging.test.ts` is part of that gate. It
packs every
publishable package and inspects the tarball a consumer would receive:

- the build output is present, with type declarations;
- no `src/`, no tests, no build state;
- every path in `exports` and `bin` exists inside the tarball.

Those are the failures that pass every other test and only appear after
publication.

## What ships, and where it came from

Two artifacts answer the two supply-chain questions:

- **`pnpm run sbom`** writes `sbom.cyclonedx.json`: every production dependency
  of the published packages in CycloneDX 1.7, generated by pnpm's own `sbom`
  command, using the same resolution that installs the packages, so the inventory
  cannot disagree with the installation it describes. Generate it at release
  time and attach it to the GitHub release.
- **npm provenance** is on in the release workflow, so each published package
  carries a signed attestation of the commit and workflow that built it. Verify
  it with `npm audit signatures`.

`tests/licenses.test.ts` runs in the ordinary suite and fails if any production
dependency's license leaves the allowed permissive set, so a copyleft license
arriving through a transitive update is a red build rather than a surprise in
somebody's legal review.

## Maintainer checklist

- [ ] `pnpm check` passes on `main`.
- [ ] Every user-visible change since the last release has a changeset.
- [ ] The version pull request's changelog reads as something a user can act on.
- [ ] `docs/designs/compatibility.md` still describes the supported runtimes.
- [ ] Anything newly public is deliberate: check the export lists in
      `tests/boundaries.test.ts` against what the release adds.
- [ ] Run `pnpm run sbom` and attach `sbom.cyclonedx.json` to the GitHub release.
- [ ] Merge the version pull request and watch the workflow publish.
- [ ] Install the published CLI in an empty directory and serve a document with
      it. The registry is the only place where a broken package is real.
