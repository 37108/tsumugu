// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import path from "node:path";

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
import { buildStatic } from "tsumugu-build";
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
/**
 * The fence the stub claims.
 *
 * Not `mermaid`: the real transformer is in the default composition now and
 * would draw that one first. This file's first half is about what happens to a
 * diagram once something produced one, whoever produced it.
 */
const stubFence = "stub-figure";

function stubDiagramTransformer(node: DiagramNode = diagram()): Transformer {
  return {
    id: "test:diagram",
    transform: (root: DocumentNode): DocumentNode => {
      let drawn = 0;
      return {
        ...root,
        children: root.children.map((child: BlockNode) => {
          if (child.type !== "code-block" || child.language !== stubFence) {
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

const pageWithDiagram = `# Pipeline\n\n\`\`\`${stubFence}\ngraph LR\n  A --> B\n\`\`\`\n`;

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
      "index.md": `${pageWithDiagram}\n\`\`\`${stubFence}\ngraph TD\n  C --> D\n\`\`\`\n`,
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

describe("a fenced mermaid block, through the default composition", () => {
  /** The project's own composition: no flag, no extra registration. */
  async function serveDrawn(
    files: Readonly<Record<string, string>>,
  ): Promise<{ readonly html: string; readonly warnings: readonly string[] }> {
    let result:
      | { readonly html: string; readonly warnings: readonly string[] }
      | undefined;

    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, files);
      const site = await createSite({ root, ...createPreset() });
      server = await serve({
        site: () => site.result,
        assetRoot: root,
        port: 0,
      });

      const html = await (await fetch(server.url)).text();
      result = {
        html,
        warnings: [...site.result.pages.values()]
          .flatMap((page) => page.diagnostics)
          .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
      };

      await server.close();
      server = undefined;
    });

    if (result === undefined) {
      throw new Error("the fixture produced no page");
    }
    return result;
  }

  it("becomes a figure, with no flag and no installation", async () => {
    const { html, warnings } = await serveDrawn({
      "index.md":
        "# Pipeline\n\n```mermaid\ngraph LR\n  A[Scanner] --> B[Renderer]\n```\n",
    });

    expect(html).toContain("<figure");
    expect(html).toContain("tsumugu-diagram-node");
    expect(html).toContain("Scanner");
    expect(html).toContain("Renderer");
    // Drawn, not shown as code.
    expect(html).not.toContain("graph LR\n");
    expect(warnings).toEqual([]);
  });

  it("draws every shape and every edge in the subset", async () => {
    const { html } = await serveDrawn({
      "index.md":
        "# Shapes\n\n```mermaid\ngraph TD\n  A[Rect] --> B(Round)\n  B -.-> C{Choice}\n  C ==> D((Circle))\n  D --- A\n```\n",
    });

    expect(html).toContain("<rect");
    expect(html).toContain('rx="10"');
    expect(html).toContain("<polygon");
    expect(html).toContain("<ellipse");
    expect(html).toContain("tsumugu-diagram-edge-dashed");
    expect(html).toContain("tsumugu-diagram-arrow");
  });

  it("makes a box wide enough for its label, in either script", async () => {
    const { html } = await serveDrawn({
      "index.md":
        "# Widths\n\n```mermaid\ngraph LR\n  A[Short] --> B[A considerably longer label here]\n```\n\n```mermaid\ngraph LR\n  C[走査] --> D[日本語のとても長いラベルです]\n```\n",
    });

    const widths = [...html.matchAll(/<rect[^>]*width="([\d.]+)"/gu)].map(
      (match) => Number(match[1]),
    );

    // Four boxes, and in each pair the longer label is the wider box.
    expect(widths.length).toBeGreaterThanOrEqual(4);
    expect(widths[1]).toBeGreaterThan(widths[0] ?? 0);
    // A CJK label measured with Latin widths would come out half the size it
    // needs, which is the one failure that would put text outside its box.
    expect(widths[3]).toBeGreaterThan(widths[2] ?? 0);
    expect(widths[3]).toBeGreaterThan(100);
  });

  it("uses the author's accessible name and description when they wrote one", async () => {
    const { html } = await serveDrawn({
      "index.md":
        "# Named\n\n```mermaid\ngraph LR\n  accTitle: Pipeline stages\n  accDescr: The scanner feeds the renderer.\n  A[Scanner] --> B[Renderer]\n```\n",
    });

    expect(html).toContain('aria-label="Pipeline stages"');
    expect(html).toContain("The scanner feeds the renderer.");
  });

  it("describes the figure itself when the author wrote none", async () => {
    const { html } = await serveDrawn({
      "index.md":
        "# Generated\n\n```mermaid\ngraph LR\n  A[Scanner] --> B[Renderer]\n```\n",
    });

    // The edges, not a list of boxes: what leads to what is what a flowchart
    // is for, and it is what a screen-reader user is otherwise missing.
    expect(html).toContain("left to right");
    expect(html).toContain("Scanner leads to Renderer");
  });

  it("leaves a diagram it cannot draw as code, and says what it was", async () => {
    const { html, warnings } = await serveDrawn({
      "index.md":
        "# Unsupported\n\n```mermaid\nstateDiagram-v2\n  [*] --> Idle\n```\n",
    });

    expect(html).toContain("<pre");
    expect(html).toContain("stateDiagram-v2");
    expect(html).not.toContain("<figure");
    expect(warnings.join("\n")).toContain("a state diagram");
  });

  it("leaves a diagram that does not parse as code, and points at the line", async () => {
    let range: { readonly line: number } | undefined;

    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md":
          "# Broken\n\nSome prose first.\n\n```mermaid\ngraph LR\n  A --> B\n  B -->|oops C\n```\n",
      });
      const site = await createSite({ root, ...createPreset() });
      range = [...site.result.pages.values()]
        .flatMap((page) => page.diagnostics)
        .find(
          (diagnostic) => diagnostic.code === "transformer-mermaid/not-drawn",
        )?.range?.start;
    });

    // The fence opens on line 5, so the bad line inside the diagram is line 8
    // of the document. A position that pointed at the fence would send an
    // author looking in the wrong place.
    expect(range?.line).toBe(8);
  });

  it("draws the same bytes twice", async () => {
    const source =
      "# Same\n\n```mermaid\ngraph TD\n  A[One] --> B{Two}\n  B -->|yes| C((Three))\n```\n";
    const first = await serveDrawn({ "index.md": source });
    const second = await serveDrawn({ "index.md": source });

    expect(first.html).toBe(second.html);
  });

  it("keeps the diagram's source in the exports", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md":
          "# Pipeline\n\n```mermaid\ngraph LR\n  A[Scanner] --> B[Renderer]\n```\n",
      });
      const site = await createSite({ root, ...createPreset() });
      server = await serve({
        site: () => site.result,
        assetRoot: root,
        port: 0,
      });

      const documents = await (
        await fetch(`${server.url}documents.json`)
      ).text();

      expect(documents).toContain("graph LR");
    });
  });
});

describe("a sequence diagram, through the default composition", () => {
  it("becomes a figure with its participants, messages and notes", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": [
          "# Request",
          "",
          "```mermaid",
          "sequenceDiagram",
          "  actor R as Reader",
          "  participant S as Server",
          "  R->>S: GET /guide",
          "  S-->>R: HTML",
          "  Note over R,S: nothing runs",
          "```",
          "",
        ].join("\n"),
      });
      const site = await createSite({ root, ...createPreset() });
      server = await serve({
        site: () => site.result,
        assetRoot: root,
        port: 0,
      });
      const html = await (await fetch(server.url)).text();

      expect(html).toContain("<figure");
      expect(html).toContain("Reader");
      expect(html).toContain("Server");
      expect(html).toContain("GET /guide");
      expect(html).toContain("nothing runs");
      expect(html).toContain("tsumugu-diagram-lifeline");
      // A reply is dashed, a request is not.
      expect(html).toContain("tsumugu-diagram-edge-dashed");
      // Described by its exchanges, in order, for a reader who cannot see it.
      expect(html).toContain("Reader sends to Server: GET /guide");

      await server.close();
      server = undefined;
    });
  });

  it("leaves a block construct as code, and names it", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": [
          "# Loop",
          "",
          "```mermaid",
          "sequenceDiagram",
          "  A->>B: tick",
          "  loop every minute",
          "    B->>A: tock",
          "  end",
          "```",
          "",
        ].join("\n"),
      });
      const site = await createSite({ root, ...createPreset() });
      const warnings = [...site.result.pages.values()]
        .flatMap((page) => page.diagnostics)
        .map((diagnostic) => diagnostic.message);

      expect(warnings.join("\n")).toContain("a loop block");
    });
  });
});

describe("a diagram in a static build", () => {
  it("is the same figure the server answered with", async () => {
    await withTemporaryDirectory(async (root) => {
      const source =
        "# Pipeline\n\n```mermaid\ngraph LR\n  A[Scanner] --> B[Renderer]\n```\n";
      await writeFiles(root, { "index.md": source });

      const site = await createSite({ root, ...createPreset() });
      server = await serve({
        site: () => site.result,
        assetRoot: root,
        port: 0,
      });
      const served = await (await fetch(server.url)).text();
      await server.close();
      server = undefined;

      await withTemporaryDirectory(async (out) => {
        await buildStatic({
          root,
          outDir: out,
          clean: true,
          ...createPreset(),
        });
        const built = await readFile(path.join(out, "index.html"), "utf8");

        // `dev` and `build` compose the same pipeline; a figure that differed
        // between them would mean the published site is not what was previewed.
        expect(built).toContain("tsumugu-diagram-node");
        expect(built).toContain("Scanner");
        expect(
          built.slice(built.indexOf("<figure"), built.indexOf("</figure>")),
        ).toBe(
          served.slice(served.indexOf("<figure"), served.indexOf("</figure>")),
        );
      });
    });
  });
});
