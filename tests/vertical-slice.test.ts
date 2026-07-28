import { startDev, type DevResult } from "@tsumugu/cli";
import { afterEach, describe, expect, it } from "vitest";

import {
  withTemporaryDirectory,
  writeFiles,
} from "./helpers/temporary-directory.js";

/**
 * The vertical slice, end to end.
 *
 * A directory with a Markdown file in it, served over HTTP through the real
 * scanner, document model, renderer, AST, theme, Virtual Tree, serializer and
 * router. Nothing is stubbed. If any of those abstractions were wrong, this is
 * where composing them would stop working.
 *
 * Port 0 lets the operating system pick a free port, so the suite never
 * collides with a developer's own server or with a parallel run.
 */

let running: DevResult | undefined;

afterEach(async () => {
  // Closed here rather than in each test, so a failing assertion still
  // releases the port instead of leaving the suite hanging.
  await running?.server.close();
  running = undefined;
});

async function serveFixture(
  files: Readonly<Record<string, string>>,
  // Synchronous callbacks are accepted, so an assertion-only case need not be
  // written async with nothing to await.
  run: (result: DevResult) => void | Promise<void>,
): Promise<void> {
  await withTemporaryDirectory(async (root) => {
    await writeFiles(root, files);
    running = await startDev({ root, port: 0 });
    await run(running);
  });
}

const page =
  "---\ntitle: Getting started\n---\n\n# Getting started\n\nRun `pnpm tsumugu dev`.\n";

describe("a directory with one Markdown file", () => {
  it("is served at / with a successful status and HTML content type", async () => {
    await serveFixture({ "index.md": page }, async ({ server }) => {
      const response = await fetch(server.url);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/html; charset=utf-8",
      );
    });
  });

  it("returns a complete page containing the title and the content", async () => {
    await serveFixture({ "index.md": page }, async ({ server }) => {
      const html = await (await fetch(server.url)).text();

      expect(html.startsWith("<!doctype html>")).toBe(true);
      // The title came from front matter through the shared precedence rules.
      // The site name comes from the directory being served, which is a
      // temporary one here, so only the page's own title is asserted.
      expect(html).toContain("<title>Getting started · ");
      expect(html).toContain('<h1 id="getting-started">Getting started');
      // Inline code survived the AST, the theme and the serializer.
      expect(html).toContain("<code>pnpm tsumugu dev</code>");
    });
  });

  it("escapes document text on the way out", async () => {
    await serveFixture(
      { "index.md": "# Title\n\nA <script>alert(1)</script> tag.\n" },
      async ({ server }) => {
        const html = await (await fetch(server.url)).text();

        // The last boundary did its job: nothing an author wrote becomes
        // markup the browser executes.
        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).toContain("&lt;script&gt;");
      },
    );
  });

  it("forbids scripts at the browser level, not only in the markup", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "index.md": page });
      running = await startDev({ root, port: 0, watch: false });

      const response = await fetch(running.server.url);
      const policy = response.headers.get("content-security-policy") ?? "";

      // The security model stated as something the browser enforces rather
      // than something Tsumugu promises.
      expect(policy).toContain("default-src 'none'");
      expect(policy).not.toContain("script-src");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await response.text()).not.toContain("<script");
    });
  });

  it("allows exactly one script, by its hash, when live reload is on", async () => {
    await serveFixture({ "index.md": page }, async ({ server }) => {
      const response = await fetch(server.url);
      const policy = response.headers.get("content-security-policy") ?? "";

      // A hash cannot be forged into matching different content, so an author's
      // script and an injected one are both still refused.
      expect(policy).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/u);
      // Styles are inline; scripts are not, and must never become so here.
      expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/u);
      expect(policy).toContain("connect-src 'self'");
    });
  });

  it("reports no diagnostics for a well-formed project", async () => {
    await serveFixture({ "index.md": page }, (result) => {
      expect(result.diagnostics).toEqual([]);
      expect(result.pageCount).toBe(1);
    });
  });
});

describe("routing through the real rules", () => {
  const files = {
    "index.md": "# Home\n",
    "guide/setup.md": "# Setup\n",
    "guide/index.md": "# Guide\n",
  };

  it("maps files to the routes the routing rules define", async () => {
    await serveFixture(files, async ({ server, pageCount }) => {
      expect(pageCount).toBe(3);

      for (const [route, heading] of [
        ["", '<h1 id="home">Home'],
        ["guide", '<h1 id="guide">Guide'],
        ["guide/setup", '<h1 id="setup">Setup'],
      ] as const) {
        const response = await fetch(`${server.url}${route}`);

        expect(response.status, `/${route}`).toBe(200);
        expect(await response.text()).toContain(heading);
      }
    });
  });

  it("serves a page whose path needs encoding", async () => {
    await serveFixture(
      { "getting started.md": "# Spaced\n" },
      async ({ server }) => {
        const response = await fetch(`${server.url}getting%20started`);

        expect(response.status).toBe(200);
        expect(await response.text()).toContain('<h1 id="spaced">Spaced');
      },
    );
  });
});

describe("problems a user will actually hit", () => {
  it("explains an empty documentation root instead of failing", async () => {
    await serveFixture({}, async ({ server, pageCount, diagnostics }) => {
      expect(pageCount).toBe(0);
      expect(diagnostics).toEqual([]);

      const response = await fetch(server.url);

      // A project with no documents is a project someone just started, not an
      // error condition — so it gets a page saying what to do next.
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("no documents yet");
    });
  });

  it("generates a landing page when the root has no index document", async () => {
    await serveFixture(
      {
        "guide/setup.md": "# Setup\n",
        "secret.md": "---\nhidden: true\n---\n\n# Secret\n",
      },
      async ({ server, pageCount }) => {
        const response = await fetch(server.url);
        const html = await response.text();

        expect(response.status).toBe(200);
        // Generated, so it does not count as a document the author wrote.
        expect(pageCount).toBe(2);
        expect(html).toContain('href="/guide/setup"');
        // A hidden document keeps its route and stays off every listing.
        expect(html).not.toContain("Secret");
        expect((await fetch(`${server.url}secret`)).status).toBe(200);
      },
    );
  });

  it("lets an authored index document replace the generated landing page", async () => {
    await serveFixture(
      { "index.md": page, "guide/setup.md": "# Setup\n" },
      async ({ server }) => {
        const html = await (await fetch(server.url)).text();

        expect(html).toContain("Getting started");
        expect(html).not.toContain("to write your own");
      },
    );
  });

  it("lists the routes that do exist when one is not found", async () => {
    await serveFixture({ "index.md": page }, async ({ server }) => {
      const response = await fetch(`${server.url}nope`);
      const html = await response.text();

      expect(response.status).toBe(404);
      // Turning "not found" into something actionable is the difference
      // between a 404 and a dead end. It is the same page as every other,
      // through the same theme and shell.
      expect(html).toContain("/nope");
      expect(html).toContain("Page not found");
      expect(html).toContain('href="/"');
      expect(html).toContain("tsumugu-doc");
    });
  });

  it("serves an image next to the document that references it", async () => {
    await serveFixture(
      {
        "index.md": "# With a picture\n\n![A diagram](/images/diagram.png)\n",
        "images/diagram.png": "pretend this is a png",
      },
      async ({ server }) => {
        const response = await fetch(`${server.url}images/diagram.png`);

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        // Development: an edited file shows up on reload rather than being
        // explained away as a cache.
        expect(response.headers.get("cache-control")).toBe("no-store");
      },
    );
  });

  it("does not serve a document's own source as a file", async () => {
    await serveFixture({ "index.md": page }, async ({ server }) => {
      const response = await fetch(`${server.url}index.md`);

      expect(response.status).toBe(404);
    });
  });

  it("rejects a traversal attempt as a bad request", async () => {
    await serveFixture({ "index.md": page }, async ({ server }) => {
      const response = await fetch(`${server.url}%2e%2e%2fetc%2fpasswd`, {
        redirect: "manual",
      });

      expect(response.status).toBe(400);
    });
  });

  it("still serves every other page when one document is unrepresentable", async () => {
    await serveFixture(
      {
        "index.md": "# Fine\n",
        "broken.md": "---\ntitle: [unclosed\n---\n\n# Still served\n",
      },
      async ({ server, diagnostics }) => {
        // A stray colon in one file must not cost a reader the whole site.
        expect(await (await fetch(server.url)).text()).toContain(
          '<h1 id="fine">Fine',
        );
        expect(await (await fetch(`${server.url}broken`)).text()).toContain(
          '<h1 id="still-served">Still served',
        );
        expect(diagnostics.some((d) => d.severity === "warning")).toBe(true);
      },
    );
  });

  it("reports a route collision rather than picking a page at random", async () => {
    await serveFixture(
      { "guide.md": "# One\n", "guide/index.md": "# Two\n" },
      ({ diagnostics }) => {
        expect(diagnostics.some((d) => d.code === "routing/collision")).toBe(
          true,
        );
      },
    );
  });
});

describe("the server itself", () => {
  it("binds loopback by default", async () => {
    await serveFixture({ "index.md": page }, ({ server }) => {
      // A documentation server started in a coffee shop should not be
      // reachable by the coffee shop.
      expect(server.host).toBe("127.0.0.1");
      expect(server.url.startsWith("http://127.0.0.1:")).toBe(true);
    });
  });

  it("chooses a free port when asked for 0", async () => {
    await serveFixture({ "index.md": page }, ({ server }) => {
      expect(server.port).toBeGreaterThan(0);
    });
  });

  it("releases the port on close, so nothing is left holding it", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "index.md": page });
      const first = await startDev({ root, port: 0 });
      const { port } = first.server;
      await first.server.close();

      // Rebinding the same port is the only honest proof that it was released.
      const second = await startDev({ root, port });
      expect(second.server.port).toBe(port);
      await second.server.close();
    });
  });

  it("reports a port already in use as a sentence", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "index.md": page });
      const held = await startDev({ root, port: 0 });

      try {
        await expect(
          startDev({ root, port: held.server.port }),
        ).rejects.toThrow(/already in use/);
      } finally {
        await held.server.close();
      }
    });
  });
});
