# Security Policy

## Project status

Tsumugu is experimental and pre-alpha. No release is currently considered production-ready. Security-sensitive behavior may change before the first stable release.

## Reporting a vulnerability

Do not disclose an unpatched vulnerability in a public issue, pull request, or discussion.

A private reporting channel has not yet been configured. Until one is available, avoid publishing exploit details and contact the repository owner through an appropriate private GitHub channel. This file will be updated with a dedicated security contact before the first public package release.

Please include:

- the affected commit or version;
- the affected component;
- a minimal reproduction;
- the expected security boundary;
- the observed impact;
- any suggested mitigation;
- whether the issue is already public.

## Security scope

Tsumugu's security model includes:

- preventing path traversal outside the configured documentation root;
- validating paths after URL decoding and normalization;
- defining and enforcing a symlink policy;
- escaping generated output correctly;
- preventing documentation JavaScript from executing by default;
- handling inline event handlers and dangerous URL schemes safely;
- separating preserved raw HTML from trusted application markup;
- binding the development server to localhost by default;
- making public network exposure explicit;
- avoiding accidental execution of untrusted configuration;
- handling malformed, deeply nested, or excessively large inputs gracefully;
- maintaining dependency security.

## Documentation trust model

Plain files are the source of truth, but plain files are not automatically trusted application code.

Tsumugu distinguishes between:

1. source preservation;
2. semantic parsing;
3. browser rendering;
4. script execution.

Preserving source HTML does not imply that every element, attribute, URL, or script can be inserted into the application shell without validation. JavaScript in documentation is disabled by default. Future interactive modes must use an explicit and isolated trust boundary, such as a sandboxed document context.

## Local development caveats

Opening an unfamiliar documentation repository may involve parsing untrusted content and executing a local configuration file. Users should review projects before running development tools. Tsumugu will minimize implicit execution and document any configuration-execution boundary clearly.

## Supported versions

No supported release line exists yet. This section will be updated before the first public pre-alpha release.

The threat model — what is defended, what is out of scope, and the review
repeated before each release — is documented in
[`docs/security-model.md`](docs/security-model.md).
