import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { RoutePath } from "../document/paths.js";
import type { ExportOutput, Page } from "../pipeline/site.js";
import { decodeRequestPath } from "../routing/routes.js";

import { readAsset } from "./assets.js";
import { clientScriptHash } from "../shell/client-script.js";

import {
  reloadPath,
  reloadScriptHash,
  type ReloadChannel,
} from "./live-reload.js";
import { escapeText } from "../theme/serialize.js";

/**
 * The development HTTP server.
 *
 * Small on purpose. It maps a request path to a route, returns the page or an
 * explanation, and stops cleanly. Everything about what a page *is* was decided
 * before it got here.
 */

/**
 * What the server needs to answer a request.
 *
 * The pipeline's build result satisfies this, which is the point: the server
 * knows what a page is and nothing about how one is produced.
 */
export interface ServedSite {
  readonly pages: ReadonlyMap<RoutePath, Page>;
  /**
   * Machine-readable outputs, by request path.
   *
   * Answered after pages and after files: a document, and a file an author put
   * in the root, both win over a generated one. Somebody who committed their
   * own `llms.txt` meant it.
   */
  readonly exports?: ReadonlyMap<string, ExportOutput>;
  /**
   * Renders the page for a request that resolved to no document.
   *
   * Supplied by the pipeline, so a missing page looks like the rest of the site
   * and lists what does exist. Without it the server falls back to the plain
   * page below, which is what a server composed without a pipeline gets.
   */
  readonly renderNotFound?: (requestedPath: string) => string;
  /** Renders the page for a request path that could not be read at all. */
  readonly renderBadRequest?: () => string;
  /**
   * Whether the site was built under the operator's `--trust` declaration
   * (ADR 7). Widens each page's `script-src` with `'self'` and the page's own
   * script hashes; every other response keeps the untrusted policy.
   */
  readonly trust?: boolean;
}

export interface ServeOptions {
  /**
   * The site to serve, asked for once per request.
   *
   * A function rather than a value, so that a rebuilt site is served the moment
   * it exists. Nothing has to tell the server that the project changed, and
   * there is no window in which it serves pages that have been replaced.
   */
  readonly site: () => ServedSite;
  /**
   * Interface to bind. Defaults to loopback.
   *
   * A documentation server started in a coffee shop should not be reachable by
   * the coffee shop. Exposure to a network has to be asked for.
   */
  readonly host?: string;
  /** Port, or 0 to let the operating system choose a free one. */
  readonly port?: number;
  /**
   * Absolute path to the documentation root, enabling static assets.
   *
   * Without it no file is ever read in response to a request, which is the
   * right default for a server composed without a project behind it.
   */
  readonly assetRoot?: string;
  /**
   * Live reload, for a development server.
   *
   * Passing a channel is what allows Tsumugu's own reload script to run, by
   * its hash. Without one, no script may run on any page — see
   * `live-reload.ts` for why that distinction is where it is.
   */
  readonly liveReload?: ReloadChannel;
}

export interface RunningServer {
  readonly url: string;
  readonly host: string;
  readonly port: number;
  /** Stops accepting connections and resolves once the port is released. */
  close(): Promise<void>;
}

/**
 * Headers sent with every response.
 *
 * The policy forbids scripts outright, which is the security model stated as
 * something a browser enforces rather than something Tsumugu promises.
 * Documentation is content; content does not execute. Inline styles are
 * permitted because a theme's styling has nowhere else to live yet.
 */
/**
 * A trusted page's script allowance.
 *
 * Its presence *is* the operator's `--trust` declaration reaching this
 * response; an untrusted response simply has none. Carrying a boolean too
 * would be a second way to say the same thing, and the two could disagree.
 */
interface TrustedScripts {
  /** CSP source expressions for the page's preserved inline scripts. */
  readonly hashes: readonly string[];
}

function securityHeaders(
  liveReload: boolean,
  trusted?: TrustedScripts,
): Readonly<Record<string, string>> {
  // Under the operator's `--trust` declaration (ADR 7), and only for a page:
  // `'self'` admits script files served from inside the root, and each of the
  // page's own inline scripts is admitted by its hash. The policy stays on —
  // an injected script has no hash, and an external origin has no source
  // expression, declaration or not.
  const declared =
    trusted === undefined
      ? ""
      : ` 'self'${trusted.hashes.map((hash) => ` ${hash}`).join("")}`;

  const policy = [
    "default-src 'none'",
    "img-src 'self' data:",
    "style-src 'unsafe-inline'",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    // Two scripts, each identified by its hash: the page client (search and
    // the copy buttons), which every page carries, and live reload, which only
    // a development server adds. Every other script on the page is still
    // refused, including one an author wrote and one an attacker injected — a
    // hash cannot be forged into matching different content.
    `script-src ${clientScriptHash}${liveReload ? ` ${reloadScriptHash}` : ""}${declared}`,
    // The scripts fetch the index and, in development, hold the reload stream
    // open. Both are this server; nothing else may be reached.
    "connect-src 'self'",
  ];

  return {
    "content-security-policy": policy.join("; "),
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
}

function page(status: number, title: string, body: string): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(title)}</title>`,
    "</head>",
    `<body><h1>${escapeText(String(status))} ${escapeText(title)}</h1>${body}</body>`,
    "</html>",
  ].join("");
}

function notFound(route: string, pages: ReadonlyMap<RoutePath, Page>): string {
  // Listing what does exist turns "not found" into something a user can act
  // on, which is the difference between a 404 and a dead end.
  const available = [...pages.keys()]
    .sort()
    .map(
      (known) =>
        `<li><a href="${escapeText(known)}">${escapeText(known)}</a></li>`,
    )
    .join("");

  return page(
    404,
    "Not found",
    `<p>No document is served at <code>${escapeText(route)}</code>.</p>` +
      (available === ""
        ? "<p>This project has no documents yet.</p>"
        : `<p>These routes exist:</p><ul>${available}</ul>`),
  );
}

/**
 * Resolves one request.
 *
 * Separate from the server so that request handling is a function of the
 * request and the pages — no sockets, no timing, no shared state — which is
 * what makes it testable and what makes two identical requests two identical
 * responses.
 */
async function handle(
  target: string,
  options: ServeOptions,
  origin: string,
  response: ServerResponse,
  send: (
    status: number,
    body: string | Uint8Array,
    contentType?: string,
    trusted?: TrustedScripts,
  ) => void,
): Promise<void> {
  const withoutQuery = target.split(/[?#]/)[0] ?? "/";

  if (options.liveReload !== undefined && withoutQuery === reloadPath) {
    // Handled before routing, because it is not a document and must never be
    // shadowed by one.
    options.liveReload.connect(response);
    return;
  }

  const site = options.site();
  const route = decodeRequestPath(withoutQuery);

  if (route === undefined) {
    // A path that cannot be decoded, or that contains traversal, is something
    // a client sent. It is a bad request, not a crash.
    send(
      400,
      site.renderBadRequest?.() ??
        page(400, "Bad request", "<p>That request path is not valid.</p>"),
    );
    return;
  }

  const found = site.pages.get(route);
  if (found !== undefined) {
    send(
      200,
      found.html,
      undefined,
      site.trust === true ? { hashes: found.scriptHashes ?? [] } : undefined,
    );
    return;
  }

  // A document wins over a file with the same route. A page is what a reader
  // asked for; the asset is a fallback, checked only once no page answered.
  if (options.assetRoot !== undefined) {
    const asset = await readAsset(options.assetRoot, route);
    if (asset.ok) {
      send(200, asset.bytes, asset.contentType);
      return;
    }
  }

  const generated = site.exports?.get(route);
  if (generated !== undefined) {
    send(200, generated.render(origin), generated.contentType);
    return;
  }

  send(404, site.renderNotFound?.(route) ?? notFound(route, site.pages));
}

/**
 * Starts the server.
 *
 * Resolves once the port is actually bound, so a caller can print a URL that
 * works rather than one that will work shortly.
 *
 * ## Shutdown
 *
 * `close()` stops accepting connections, drops the keep-alive ones a browser
 * leaves open, and resolves when the port is free. Nothing installs a signal
 * handler here: a library that catches `SIGINT` decides on its own that the
 * process should end, which is not a library's decision. The CLI handles the
 * signals and calls `close()`, which is the arrangement that lets a test start
 * and stop a dozen servers without leaking a handle.
 */
export function serve(options: ServeOptions): Promise<RunningServer> {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port ?? 0;

  const server: Server = createServer((request, response) => {
    let answered = false;

    const send = (
      status: number,
      body: string | Uint8Array,
      contentType = "text/html; charset=utf-8",
      trusted?: TrustedScripts,
    ): void => {
      // A request gets one response. Without this, a failure *after* a response
      // had already been written would try to write a second one, and Node
      // throws — turning a handled error into an unhandled one.
      if (answered) {
        return;
      }
      answered = true;

      response.writeHead(status, {
        "content-type": contentType,
        // Development, not production: an edited file must show up on reload
        // rather than being explained away as a cache.
        "cache-control": "no-store",
        ...securityHeaders(options.liveReload !== undefined, trusted),
      });
      response.end(body);
    };

    // The address this request arrived on, so a generated sitemap says where
    // the site actually is rather than where it might be published.
    const origin = `http://${request.headers.host ?? `${host}:${String(requestedPort)}`}`;

    handle(request.url ?? "/", options, origin, response, send).catch(
      (cause: unknown) => {
        // Reaching here is a bug in Tsumugu rather than a problem with the
        // project, so the reader gets a page that says so and nothing else. A
        // stack trace in a response would name absolute paths on the machine
        // running the server; it goes to the console, where it belongs.
        console.error(cause);
        send(
          500,
          page(
            500,
            "Server error",
            "<p>Tsumugu failed to produce this page. The error was written to the terminal running the server.</p>",
          ),
        );
      },
    );
  });

  return new Promise((resolve, reject) => {
    const onError = (cause: Error): void => {
      server.removeListener("listening", onListening);
      reject(describeBindFailure(cause, host, requestedPort));
    };

    const onListening = (): void => {
      server.removeListener("error", onError);
      const address: AddressInfo | string | null = server.address();
      const port =
        address !== null && typeof address === "object"
          ? address.port
          : requestedPort;

      resolve({
        url: `http://${host}:${String(port)}/`,
        host,
        port,
        close: () =>
          new Promise<void>((done, fail) => {
            // An open event stream is a request that never ends, so it is
            // ended here; closeAllConnections then takes the keep-alive ones,
            // without which a test hangs rather than failing.
            options.liveReload?.close();
            server.closeAllConnections();
            server.close((error) => {
              if (error === undefined) {
                done();
              } else {
                fail(error);
              }
            });
          }),
      });
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(requestedPort, host);
  });
}

/**
 * Turns a bind failure into something a user can act on.
 *
 * "EADDRINUSE" is not a sentence. The original is kept as the cause so a stack
 * trace is still reachable.
 */
function describeBindFailure(cause: Error, host: string, port: number): Error {
  const code = "code" in cause ? String(cause.code) : "";

  if (code === "EADDRINUSE") {
    return new Error(
      `Port ${String(port)} on ${host} is already in use. Stop whatever is using it, or start Tsumugu on a different port.`,
      { cause },
    );
  }
  if (code === "EACCES") {
    return new Error(
      `Not allowed to bind port ${String(port)} on ${host}. Ports below 1024 usually need elevated privileges; pick a higher one.`,
      { cause },
    );
  }
  if (code === "EADDRNOTAVAIL") {
    return new Error(`The address ${host} does not exist on this machine.`, {
      cause,
    });
  }
  return new Error(`Could not start the server on ${host}:${String(port)}.`, {
    cause,
  });
}
