import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoutePath } from "../document/paths.js";
import type { Page } from "../pipeline/build.js";

import { serve, type RunningServer, type ServeOptions } from "./serve.js";

/**
 * The development server's contract.
 *
 * Every case binds port 0, so the suite never collides with a developer's own
 * server or with a parallel run, and every case closes the server afterwards —
 * a leaked listener does not fail the test that leaked it, it hangs whichever
 * one runs last.
 */

let running: RunningServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

function pageAt(route: string, html: string): Page {
  return {
    route: route as RoutePath,
    title: "A page",
    html,
    diagnostics: [],
  };
}

const pages = new Map<RoutePath, Page>([
  ["/" as RoutePath, pageAt("/", "<!doctype html><p>Home</p>")],
  ["/guide" as RoutePath, pageAt("/guide", "<!doctype html><p>Guide</p>")],
]);

async function start(
  overrides: Partial<ServeOptions> = {},
): Promise<RunningServer> {
  running = await serve({ pages, port: 0, ...overrides });
  return running;
}

describe("serve", () => {
  it("binds loopback by default", async () => {
    const server = await start();

    // A documentation server started in a coffee shop should not be reachable
    // by the coffee shop.
    expect(server.host).toBe("127.0.0.1");
    expect(server.url).toBe(`http://127.0.0.1:${String(server.port)}/`);
  });

  it("reports the port the operating system actually chose", async () => {
    const server = await start();

    expect(server.port).toBeGreaterThan(0);
  });

  it("binds an explicit host and port", async () => {
    const server = await start({ host: "127.0.0.1", port: 0 });

    expect(server.host).toBe("127.0.0.1");
  });

  it("serves a page as HTML in UTF-8", async () => {
    const server = await start();
    const response = await fetch(server.url);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(await response.text()).toContain("Home");
  });

  it("sends the security headers with every response", async () => {
    const server = await start();

    for (const path of ["", "gone"]) {
      const response = await fetch(`${server.url}${path}`);

      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-security-policy")).toContain(
        "default-src 'none'",
      );
    }
  });

  it("ignores a query string when resolving a route", async () => {
    const server = await start();
    const response = await fetch(`${server.url}guide?highlight=install`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Guide");
  });

  it("returns 404 for a route with no document", async () => {
    const server = await start();
    const response = await fetch(`${server.url}missing`);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("/missing");
  });

  it("returns 400 for a path it cannot decode", async () => {
    const server = await start();
    const response = await fetch(`${server.url}%E0%A4%A`);

    expect(response.status).toBe(400);
  });

  it("refuses a traversal attempt without naming anything on disk", async () => {
    const server = await start();
    const response = await fetch(
      `${server.url}%2e%2e%2f%2e%2e%2fetc%2fpasswd`,
      {
        redirect: "manual",
      },
    );
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).not.toContain("/etc");
    expect(html).not.toContain("passwd");
  });

  it("uses the pages the pipeline generated for missing routes when given them", async () => {
    const server = await start({
      renderNotFound: (requested) => `<p>nothing at ${requested}</p>`,
      renderBadRequest: () => "<p>that is not a path</p>",
    });

    expect(await (await fetch(`${server.url}gone`)).text()).toBe(
      "<p>nothing at /gone</p>",
    );
    expect(await (await fetch(`${server.url}%E0%A4%A`)).text()).toBe(
      "<p>that is not a path</p>",
    );
  });

  it("answers with a safe error page when producing one fails", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const server = await start({
      renderNotFound: () => {
        throw new Error("/Users/someone/secret/path exploded");
      },
    });
    const response = await fetch(`${server.url}gone`);
    const html = await response.text();

    expect(response.status).toBe(500);
    // The reader is told the server failed. Where it failed goes to the
    // terminal, because a stack trace in a response names paths on the machine.
    expect(html).toContain("Tsumugu failed to produce this page");
    expect(html).not.toContain("/Users/someone");
    expect(errors).toHaveBeenCalled();

    errors.mockRestore();
  });

  it("explains a port that is already in use", async () => {
    const first = await start();

    await expect(
      serve({ pages, port: first.port, host: "127.0.0.1" }),
    ).rejects.toThrow(/already in use/u);
  });

  it("releases the port when it is closed", async () => {
    const first = await serve({ pages, port: 0 });
    const port = first.port;
    await first.close();

    // Binding the same port again is the only proof that closing finished
    // rather than merely being requested.
    const second = await serve({ pages, port, host: "127.0.0.1" });
    expect(second.port).toBe(port);
    await second.close();
  });

  it("can be closed twice without failing", async () => {
    const server = await serve({ pages, port: 0 });
    await server.close();

    await expect(server.close()).rejects.toThrow();
  });
});
