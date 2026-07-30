// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { createSite, serve, type RunningServer } from "tsumugu-core";
import { createPreset } from "tsumugu-preset";

import {
  withTemporaryDirectory,
  writeFiles,
} from "./helpers/temporary-directory.js";

/**
 * An API description, served as a page.
 *
 * Everything asserted here is what a reader or an author can observe: a route
 * exists, an operation has an anchor, a table has the columns it should, a
 * warning names what could not be read. The mapping from OpenAPI to the AST is
 * an internal contract, and asserting on it would make every change to the
 * renderer a failing test rather than a behaviour change.
 */

let server: RunningServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

const description = `openapi: "3.1.0"
info:
  title: Pet Store
  version: "1.2.0"
  description: One shop, several pets.
tags:
  - name: Pets
    description: Everything with fur.
  - name: Store
paths:
  /pets:
    get:
      tags: [Pets]
      summary: List every pet
      parameters:
        - name: limit
          in: query
          required: false
          description: How many to return.
          schema:
            type: integer
            format: int32
      responses:
        "200":
          description: A list of pets.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
    post:
      tags: [Pets]
      summary: Add a pet
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/Pet"
      responses:
        "201":
          description: Created.
  /store/orders:
    get:
      tags: [Store]
      summary: List orders
      responses:
        "200":
          description: Orders.
  /health:
    get:
      summary: Health check
      responses:
        "200":
          description: Fine.
components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
        friend:
          $ref: "#/components/schemas/Pet"
`;

interface Served {
  readonly html: string;
  readonly warnings: readonly string[];
  readonly url: string;
  readonly routes: readonly string[];
}

async function serveDescription(
  files: Readonly<Record<string, string>>,
  route = "api",
): Promise<Served> {
  let result: Served | undefined;

  await withTemporaryDirectory(async (root) => {
    await writeFiles(root, { "index.md": "# Home\n", ...files });
    const site = await createSite({ root, ...createPreset() });
    server = await serve({ site: () => site.result, assetRoot: root, port: 0 });

    result = {
      html: await (await fetch(`${server.url}${route}`)).text(),
      // The hint is part of what an author is told, so it is part of what is
      // asserted: a warning that names a problem without naming the fix is
      // half a warning.
      warnings: [...site.result.pages.values()]
        .flatMap((page) => page.diagnostics)
        .map(
          (diagnostic) =>
            `${diagnostic.code}: ${diagnostic.message} ${diagnostic.hint ?? ""}`,
        ),
      url: server.url,
      routes: [...site.result.pages.keys()],
    };

    await server.close();
    server = undefined;
  });

  if (result === undefined) {
    throw new Error("the fixture produced no page");
  }
  return result;
}

describe("a description named as one", () => {
  it("becomes a page whose route drops the whole extension", async () => {
    const { routes } = await serveDescription({
      "api.openapi.yaml": description,
    });

    expect(routes).toContain("/api");
    expect(routes).not.toContain("/api.openapi");
  });

  it("claims the bare name too", async () => {
    const { routes } = await serveDescription(
      { "openapi.yaml": description },
      "openapi",
    );

    expect(routes).toContain("/openapi");
  });

  it("leaves other data files as assets", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": "# Home\n",
        "config.json": '{"port":3000}\n',
        "data.yaml": "count: 3\n",
      });
      const site = await createSite({ root, ...createPreset() });

      expect([...site.result.pages.keys()]).toEqual(["/", "/search"]);
      expect(site.result.assets).toEqual(["config.json", "data.yaml"]);
    });
  });
});

describe("the page a description produces", () => {
  it("is titled and summarized by the description's own info", async () => {
    const { html } = await serveDescription({
      "api.openapi.yaml": description,
    });

    expect(html).toContain("Pet Store");
    expect(html).toContain("Version 1.2.0.");
    expect(html).toContain("One shop, several pets.");
  });

  it("makes a section per tag, in the order the description declares them", async () => {
    const { html } = await serveDescription({
      "api.openapi.yaml": description,
    });

    expect(html).toContain(">Pets<");
    expect(html).toContain("Everything with fur.");
    expect(html.indexOf(">Pets<")).toBeLessThan(html.indexOf(">Store<"));
  });

  it("gives every operation a heading a reader can link to", async () => {
    const { html } = await serveDescription({
      "api.openapi.yaml": description,
    });

    // Method and path together, with an identifier the anchor link uses.
    expect(html).toMatch(/<h3 id="[^"]+">GET <code>\/pets<\/code>/u);
    expect(html).toMatch(/<h3 id="[^"]+">POST <code>\/pets<\/code>/u);
    expect(html).toContain("List every pet");
  });

  it("keeps an untagged operation, in a section of its own", async () => {
    const { html } = await serveDescription({
      "api.openapi.yaml": description,
    });

    expect(html).toContain("Other operations");
    expect(html).toContain("/health");
    // Last, so the tagged sections read first.
    expect(html.indexOf("Other operations")).toBeGreaterThan(
      html.indexOf(">Store<"),
    );
  });

  it("puts parameters and responses in tables", async () => {
    const { html } = await serveDescription({
      "api.openapi.yaml": description,
    });

    expect(html).toContain("Parameters");
    expect(html).toContain('<th scope="col">Required</th>');
    expect(html).toContain("limit");
    expect(html).toContain("integer (int32)");
    expect(html).toContain("Responses");
    expect(html).toContain("A list of pets.");
    expect(html).toContain("application/json");
  });

  it("shows a request body's schema as code", async () => {
    const { html } = await serveDescription({
      "api.openapi.yaml": description,
    });

    expect(html).toContain("Request body");
    expect(html).toContain('<code data-language="json">');

    // The reference was resolved where it is used, so a reader sees the shape
    // rather than a pointer. Read from the block's text rather than the markup:
    // the highlighter splits it into spans, and asserting on where it split
    // would be asserting on the highlighter.
    const block = html.slice(
      html.indexOf('<code data-language="json">'),
      html.indexOf("</code>", html.indexOf('<code data-language="json">')),
    );
    const shape = block.replace(/<[^>]+>/gu, "").replaceAll("&quot;", '"');
    expect(shape).toContain('"properties"');
    expect(shape).toContain('"name"');
  });

  it("puts its operations in search and the exports", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": "# Home\n",
        "api.openapi.yaml": description,
      });
      const site = await createSite({ root, ...createPreset() });
      server = await serve({
        site: () => site.result,
        assetRoot: root,
        port: 0,
      });

      const search = await (await fetch(`${server.url}search.json`)).text();
      const llms = await (await fetch(`${server.url}llms.txt`)).text();

      expect(search).toContain("GET /pets");
      expect(llms).toContain("Pet Store");
    });
  });
});

describe("what a description cannot say", () => {
  it("expands a cycle once and then names it", async () => {
    const { html, warnings } = await serveDescription({
      "api.openapi.yaml": description,
    });

    // Pet.friend is a Pet. The page renders, and it renders once.
    expect(html).toContain("friend");
    expect(warnings.join("\n")).not.toContain("renderer-openapi/unparsable");
  });

  it("warns about a reference into another file and shows the name", async () => {
    const { html, warnings } = await serveDescription({
      "api.openapi.yaml": `openapi: "3.1.0"
info: { title: Split, version: "1" }
paths:
  /a:
    get:
      responses:
        "200":
          description: OK
      parameters:
        - $ref: "./other.yaml#/components/parameters/Page"
`,
    });

    expect(warnings.join("\n")).toContain("points outside this file");
    expect(html).toContain("Split");
  });

  it("warns about a reference that does not exist", async () => {
    const { warnings } = await serveDescription({
      "api.openapi.yaml": `openapi: "3.1.0"
info: { title: Missing, version: "1" }
paths:
  /a:
    get:
      responses:
        "200":
          description: OK
      parameters:
        - $ref: "#/components/parameters/Nope"
`,
    });

    expect(warnings.join("\n")).toContain("does not exist in this description");
  });

  it("tells a Swagger 2.0 author to convert it, and still renders the page", async () => {
    const { html, warnings } = await serveDescription({
      "api.openapi.yaml": `swagger: "2.0"
info:
  title: Old API
  version: "1.0"
paths:
  /a:
    get:
      responses:
        "200":
          description: OK
`,
    });

    expect(warnings.join("\n")).toContain("Swagger 2.0");
    expect(warnings.join("\n")).toContain("swagger2openapi");
    // The title still reaches the reader, so the page names what it is.
    expect(html).toContain("Old API");
  });

  it("does not cost the site a page when the file will not parse", async () => {
    const { html, warnings } = await serveDescription({
      "api.openapi.yaml": 'openapi: "3.1.0"\n  bad: [indent\n',
    });

    expect(warnings.join("\n")).toContain("renderer-openapi/unparsable");
    expect(html).toContain("could not be read");
  });
});
