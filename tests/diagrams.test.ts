// @vitest-environment jsdom
import axe, { type AxeResults } from "axe-core";
import { afterEach, describe, expect, it } from "vitest";

import {
  createSite,
  serve,
  type BlockNode,
  type DiagramNode,
  type DocumentNode,
  type RunningServer,
  type Transformer,
} from "tsumugu-core";
import { createPreset } from "tsumugu-preset";

import {
  withTemporaryDirectory,
  writeFiles,
} from "./helpers/temporary-directory.js";

/**
 * The delivery path for a diagram, from the document model to the reader.
 *
 * The figure here is built by a transformer written in this file rather than by
 * the Mermaid transformer, and deliberately so: what is under test is what
 * happens to a diagram *once something produced one* — the accessible figure,
 * the theme's colours, a wide figure that scrolls without widening the page,
 * and the source still reaching search and the exports. Whether Mermaid's
 * syntax parses is a different question, tested where that parser lives.
 *
 * That split is what lets this file keep passing when the subset grows.
 */

let server: RunningServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** A figure Tsumugu could have drawn: two boxes and an arrow, in one unit. */
const drawnSvg =
  '<g class="tsumugu-diagram-node"><rect x="1" y="1" width="120" height="40"></rect>' +
  '<text x="61" y="26" text-anchor="middle">Scanner</text></g>' +
  '<path d="M121 21 L200 21" class="tsumugu-diagram-edge"></path>';

function diagram(overrides: Partial<DiagramNode> = {}): DiagramNode {
  return {
    type: "diagram",
    dialect: "mermaid",
    svg: drawnSvg,
    width: 320,
    height: 60,
    title: "Pipeline stages",
    description: "Left to right: Scanner then Renderer.",
    source: "graph LR\n  A[Scanner] --> B[Renderer]\n",
    ...overrides,
  };
}

/**
 * Replaces every fenced `mermaid` block with a diagram.
 *
 * This is the shape the real transformer has, minus the parser, so the
 * composition under test is the composition a project gets.
 */
function stubDiagramTransformer(node: DiagramNode = diagram()): Transformer {
  return {
    id: "test:diagram",
    transform: (root: DocumentNode): DocumentNode => {
      let drawn = 0;
      return {
        ...root,
        children: root.children.map((child: BlockNode) => {
          if (child.type !== "code-block" || child.language !== "mermaid") {
            return child;
          }
          // The producer numbers the figures it makes, which is what lets two
          // of them on one page be told apart. The real transformer does the
          // same for the same reason.
          drawn += 1;
          return { ...node, id: `figure-${String(drawn)}` };
        }),
      };
    },
  };
}

const pageWithDiagram = "# Pipeline\n\n```mermaid\ngraph LR\n  A --> B\n```\n";

/** Serves a fixture through the real preset plus the stub transformer. */
async function serveWithDiagram(
  files: Readonly<Record<string, string>>,
  node?: DiagramNode,
): Promise<{ readonly url: string; readonly html: string }> {
  let result: { readonly url: string; readonly html: string } | undefined;

  await withTemporaryDirectory(async (root) => {
    await writeFiles(root, files);
    const preset = createPreset();
    const site = await createSite({
      root,
      ...preset,
      transformers: [
        ...preset.transformers,
        stubDiagramTransformer(node ?? diagram()),
      ],
    });
    server = await serve({
      site: () => site.result,
      assetRoot: root,
      port: 0,
    });

    const html = await (await fetch(server.url)).text();
    result = { url: server.url, html };

    await server.close();
    server = undefined;
  });

  if (result === undefined) {
    throw new Error("the fixture produced no page");
  }
  return result;
}

describe("a diagram on a page", () => {
  it("is a figure with an accessible name and description", async () => {
    const { html } = await serveWithDiagram({ "index.md": pageWithDiagram });

    expect(html).toContain("<figure");
    expect(html).toContain('role="img"');
    // The figure is named by its own title and described by its caption, so a
    // screen reader announces what it shows rather than "graphic".
    expect(html).toContain('aria-label="Pipeline stages"');
    expect(html).toMatch(/aria-describedby="([^"]+)"/u);

    const describedBy = /aria-describedby="([^"]+)"/u.exec(html)?.[1];
    expect(describedBy).toBeDefined();
    expect(html).toContain(
      `<figcaption class="tsumugu-visually-hidden" id="${String(describedBy)}">Left to right: Scanner then Renderer.</figcaption>`,
    );
  });

  it("draws what the diagram was given, and nothing the author wrote", async () => {
    const { html } = await serveWithDiagram({ "index.md": pageWithDiagram });

    expect(html).toContain("tsumugu-diagram-node");
    expect(html).toContain("Scanner");
    // The fenced source is not left on the page as code beside the figure.
    expect(html).not.toContain("<pre");
  });

  it("carries no script and needs no new content security policy", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "index.md": pageWithDiagram });
      const preset = createPreset();
      const site = await createSite({
        root,
        ...preset,
        transformers: [...preset.transformers, stubDiagramTransformer()],
      });
      server = await serve({
        site: () => site.result,
        assetRoot: root,
        port: 0,
      });

      const response = await fetch(server.url);
      const html = await response.text();
      const figure = html.slice(
        html.indexOf("<figure"),
        html.indexOf("</figure>"),
      );

      // The page client ships on every page by hash (ADR 4); what matters is
      // that the figure adds nothing to it and needs no policy of its own.
      expect(figure).not.toContain("<script");
      expect(figure).not.toContain("onload");
      const policy = response.headers.get("content-security-policy") ?? "";
      expect(policy).toContain("default-src 'none'");
      expect(policy).toContain("img-src 'self' data:");
      // The figure widens nothing: script-src still names only the page
      // client's own hash, and no origin was added for it.
      expect(policy).toContain("script-src 'sha256-");
      expect(policy).not.toContain("script-src 'self'");
    });
  });

  it("gives two figures on one page separate identifiers", async () => {
    const { html } = await serveWithDiagram({
      "index.md": `${pageWithDiagram}\n\`\`\`mermaid\ngraph TD\n  C --> D\n\`\`\`\n`,
    });

    const captionIds = [...html.matchAll(/<figcaption[^>]*id="([^"]+)"/gu)].map(
      (match) => match[1],
    );

    expect(captionIds.length).toBe(2);
    expect(new Set(captionIds).size).toBe(2);
  });

  it("takes its colours from the theme rather than baking them in", async () => {
    const { html } = await serveWithDiagram({ "index.md": pageWithDiagram });
    const figure = html.slice(
      html.indexOf("<figure"),
      html.indexOf("</figure>"),
    );

    // A hard-coded colour is a figure that cannot follow a dark page.
    expect(figure).not.toMatch(/#[0-9a-f]{3,6}\b/iu);
    expect(figure).not.toMatch(/\brgb\(/u);
  });

  it("scrolls a wide figure inside its own region", async () => {
    const { html } = await serveWithDiagram(
      { "index.md": pageWithDiagram },
      diagram({ width: 1800, height: 400 }),
    );

    // Reachable and scrollable by keyboard: a scroll container nobody can focus
    // is a region a keyboard user cannot read. Named, like the table's.
    expect(html).toContain('class="tsumugu-diagram-scroll"');
    expect(html).toMatch(/tabindex="0"/u);
    expect(html).toContain('role="region"');
  });

  it("keeps the diagram's words in search and the exports", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "index.md": pageWithDiagram });
      const preset = createPreset();
      const site = await createSite({
        root,
        ...preset,
        transformers: [...preset.transformers, stubDiagramTransformer()],
      });
      server = await serve({
        site: () => site.result,
        assetRoot: root,
        port: 0,
      });

      const documents = await (
        await fetch(`${server.url}documents.json`)
      ).text();
      const llms = await (await fetch(`${server.url}llms.txt`)).text();
      const search = await (await fetch(`${server.url}search.json`)).text();

      // A reader who cannot see the figure, and a model reading the corpus,
      // both get what the figure says.
      for (const [name, body] of [
        ["documents.json", documents],
        ["search.json", search],
      ] as const) {
        expect(body, name).toContain("Left to right: Scanner then Renderer.");
        expect(body, name).toContain("graph LR");
      }
      expect(llms).toContain("Pipeline");
    });
  });

  it("passes an accessibility audit at narrow and wide widths", async () => {
    for (const width of [360, 1280]) {
      const { html } = await serveWithDiagram({ "index.md": pageWithDiagram });

      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: width,
      });
      // Transplanted as a whole document, attributes included, the way
      // tests/accessibility.test.ts does it: a harness that dropped `lang`
      // would report a failure the server does not have.
      const parsed = new DOMParser().parseFromString(html, "text/html");
      for (const attribute of parsed.documentElement.attributes) {
        document.documentElement.setAttribute(attribute.name, attribute.value);
      }
      document.documentElement.innerHTML = parsed.documentElement.innerHTML;

      const results: AxeResults = await axe.run(document, {
        // Contrast needs layout, which jsdom does not do; the theme's own
        // tests check the palette instead.
        rules: { "color-contrast": { enabled: false } },
      });

      expect(
        results.violations.map((violation) => violation.id),
        `width ${width}`,
      ).toEqual([]);
    }
  });
});
