# 3. Live reload and the one script Tsumugu ships

- **Status:** Accepted
- **Date:** 2026-07-28
- **Supersedes:** none
- **Related:** issue #29, issue #30, [`docs/designs/principles.md`](../designs/principles.md), `packages/core/src/server/live-reload.ts`

## Context

Tsumugu's security model is stated as something a browser enforces rather than
something Tsumugu promises: every response carries
`Content-Security-Policy: default-src 'none'` with no `script-src` at all.
Documentation is content, and content does not execute. A document that contains
a `<script>`, whether its author wrote it or an attacker injected it through a
dependency that generates documentation, cannot run it.

Live reload conflicts with that directly. A page cannot reload itself when
something changes on disk without code running in the browser, and no CSS
feature substitutes for it. The alternatives were:

- **No live reload.** Watch mode still rebuilds; the reader presses reload.
- **A meta refresh.** Polls on a timer, reloads whether or not anything changed,
  and steals the scroll position of somebody who is reading rather than editing.
- **A script, allowed narrowly.**

The policy must state what the script can do, where it runs, and who benefits.

## Decision

### Live reload is a development-server feature, and opt-in below that

`serve` sends the unchanged policy unless it is given a reload channel, and the
channel is created by `tsumugu dev`. A static build, a production host, or any
other entry point that composes the pipeline never creates one and never emits a
script. `tsumugu dev --no-live-reload` is not needed as a flag today because
`watch: false` implies it, but the option exists in the API.

### The exception is a hash, not a nonce and not `unsafe-inline`

When live reload is on, the policy gains exactly two sources:

```text
script-src 'sha256-<hash of Tsumugu's own script>'; connect-src 'self'
```

A hash allows one exact byte sequence. An author's script, an injected script,
or a modified copy of ours fails the policy because
changing a single character changes the hash. A nonce would allow anything the
server marked, and `unsafe-inline` would allow everything; both would make the
guarantee weaker than it needs to be for a five-line script.

`connect-src 'self'` exists because the script opens an event stream back to the
same server. It does not permit fetching anything else.

### The script is small enough to read

It opens `EventSource("/__tsumugu__/reload")` and calls `location.reload()` when
the server sends a `reload` event. It is a single expression, visible in
view-source, and it is the whole of the client. Reconnection is the browser's,
which is why restarting the server also refreshes open tabs.

### Server-sent events, not a WebSocket

One HTTP response held open, no dependency, no upgrade handshake, and automatic
reconnection. A WebSocket would buy bidirectional traffic that nothing needs.

### The endpoint is namespaced and resolved before routing

`/__tsumugu__/reload` is answered before the router runs, so no document can
shadow it, and the double-underscore form makes a collision with a real
documentation path implausible.

## Consequences

### Positive

- Editing a file updates the open page, which is the feedback loop the
  development server exists for.
- The security property that matters, that documentation JavaScript never runs, is
  unchanged, and is now enforced by a mechanism narrow enough to state in one
  line.
- Nothing outside the development command can emit a script by accident: it
  takes a channel that only that command creates.

### Negative

- Pages served by `tsumugu dev` are no longer byte-identical to pages served by
  anything else, so a CSP problem can now appear in development only, or in
  production only.
- The hash must stay in step with the script. They are derived from the same
  constant in one module, so they cannot drift, but a future change that
  parameterizes the script would break that.
- A browser with `EventSource` disabled silently gets no reload rather than an
  explanation.

### Follow-up required

- When the RFC process exists (issue #60), this decision is the kind that
  belongs in one: it changes what the trust model permits, even narrowly.
- A future production or static-build path must not grow a reason to reuse this
  channel.

## Alternatives considered

**Reload by meta refresh.** No script, and no way to tell "changed" from
"unchanged": every reader gets a reload every few seconds, losing their scroll
position and their place in a code block.

**A separate script file rather than an inline one.** It would need `'self'` in
`script-src`, which allows every other file the server serves as a script,
including one an author dropped into their documentation directory. Strictly
worse than a hash.

**Polling from the client for a build identifier.** Still a script, so it costs
the same exception, and adds a request every interval to avoid a connection that
is already free to hold open.
