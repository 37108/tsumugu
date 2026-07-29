import { createHash } from "node:crypto";
import type { ServerResponse } from "node:http";

/**
 * Live reload.
 *
 * This is the one place Tsumugu runs JavaScript in a reader's browser, and it
 * is worth being explicit about why that is acceptable here and nowhere else.
 *
 * The security model says documentation is content, and content does not
 * execute: the content security policy sends `default-src 'none'` and no
 * `script-src` at all, so a document that contains a `<script>` cannot run it.
 * That property is not weakened by this module. What is added is **one script,
 * written by Tsumugu, pinned by its SHA-256 hash**, allowed by that hash alone —
 * so the policy still refuses every other script on the page, including one an
 * author wrote and one an attacker injected. A hash cannot be forged into
 * matching different content; that is what makes this narrower than a nonce and
 * far narrower than `'unsafe-inline'`.
 *
 * It is also opt-in and development-only. `serve` sends the ordinary policy
 * unless a channel is passed, and the channel is created by the development
 * command. A build or a production host that never creates one never ships a
 * byte of JavaScript.
 *
 * The transport is server-sent events, not a WebSocket: the browser reconnects
 * on its own, it is one HTTP response held open, and it needs no dependency.
 */

/** The path the client connects to. Namespaced so it cannot shadow a route. */
export const reloadPath = "/__tsumugu__/reload";

/**
 * The client.
 *
 * Deliberately tiny, and readable in a browser's view-source: it opens the
 * stream and reloads when told to. `EventSource` retries on its own, so a
 * server restart reconnects without anything here handling it — and the
 * `reload` on reconnect is what makes "restart the server" refresh the page.
 */
export const reloadScript =
  '(()=>{const s=new EventSource("/__tsumugu__/reload");s.addEventListener("reload",()=>{location.reload()});})();';

/** The CSP source expression that allows exactly the script above. */
export const reloadScriptHash = `'sha256-${createHash("sha256")
  .update(reloadScript, "utf8")
  .digest("base64")}'`;

export interface ReloadChannel {
  /** Registers a connected browser. */
  connect(response: ServerResponse): void;
  /** Tells every connected browser to reload. */
  notify(): void;
  /** Ends every open stream, so nothing holds the process open. */
  close(): void;
  /** How many browsers are listening. Used by tests and the startup message. */
  readonly size: number;
}

/**
 * Creates a channel.
 *
 * Connections are held in a set rather than a list because the only operations
 * are add, remove and iterate, and a browser that navigates away has to be
 * removed from wherever it is.
 */
export function createReloadChannel(): ReloadChannel {
  const clients = new Set<ServerResponse>();

  return {
    connect(response) {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      // An immediate comment flushes the headers, so the browser treats the
      // connection as open rather than as a request that has not answered yet.
      response.write(": connected\n\n");

      clients.add(response);
      response.on("close", () => {
        clients.delete(response);
      });
    },

    notify() {
      for (const client of clients) {
        client.write("event: reload\ndata: 1\n\n");
      }
    },

    close() {
      for (const client of clients) {
        client.end();
      }
      clients.clear();
    },

    get size() {
      return clients.size;
    },
  };
}
