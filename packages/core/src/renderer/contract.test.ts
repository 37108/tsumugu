import { describe, expect, it } from "vitest";

import type { DocumentNode } from "../ast/nodes.js";
import {
  discoverDocument,
  loadDocument,
  type LoadedDocument,
} from "../document/document.js";
import { toRoutePath, type RoutePath } from "../document/paths.js";
import { rendererContractCases, type ContractCase } from "./contract.suite.js";
import {
  renderDocument,
  rendererCodes,
  selectRenderer,
  type RenderResult,
  type Renderer,
} from "./contract.js";

function route(value: string): RoutePath {
  const result = toRoutePath(value);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function document(path: string, content = "# Title\n"): LoadedDocument {
  const discovered = discoverDocument(path, { size: 1, modifiedAtMs: 1 });
  if (!discovered.ok) {
    throw new Error(discovered.diagnostic.message);
  }
  return loadDocument(discovered.value, { content, route: route("/a") });
}

const markdownFile = document("docs/a.md");
const htmlFile = document("docs/a.html", "<p>Hi</p>");

function treeFor(text: string): DocumentNode {
  return {
    type: "document",
    children: [
      { type: "paragraph", children: [{ type: "text", value: text }] },
    ],
  };
}

/** A minimal conforming renderer, standing in until the real ones exist. */
function fakeRenderer(id: string, format: "markdown" | "html"): Renderer {
  return {
    id,
    supports: (candidate) => candidate.format === format,
    render: (candidate): RenderResult => ({ root: treeFor(candidate.content) }),
  };
}

/**
 * Runs a case as a promise.
 *
 * Cases may be synchronous or asynchronous. Awaiting inside an async function
 * turns a synchronous throw into a rejection, so both shapes can be asserted
 * on the same way.
 */
async function runCase(entry: ContractCase | undefined): Promise<void> {
  await entry?.run();
}

describe("the contract suite", () => {
  // The suite is the reusable part: an official renderer package runs these
  // same cases rather than restating the properties and drifting from them.
  const cases = rendererContractCases(
    fakeRenderer("fake-markdown", "markdown"),
    {
      supported: [markdownFile],
      unsupported: [htmlFile],
    },
  );

  it.each(cases.map((entry) => [entry.name, entry] as const))(
    "%s",
    async (_name, entry) => {
      await entry.run();
    },
  );

  it("rejects a renderer that claims everything", async () => {
    const greedy: Renderer = {
      id: "greedy",
      supports: () => true,
      render: () => ({ root: treeFor("x") }),
    };
    const [failing] = rendererContractCases(greedy, {
      supported: [markdownFile],
      unsupported: [htmlFile],
    }).filter((entry) => entry.name.startsWith("declines"));

    await expect(runCase(failing)).rejects.toThrow(/claims/);
  });

  it("rejects a non-deterministic renderer", async () => {
    let calls = 0;
    const unstable: Renderer = {
      id: "unstable",
      supports: (candidate) => candidate.format === "markdown",
      render: () => {
        calls += 1;
        return { root: treeFor(`run ${calls}`) };
      },
    };
    const [failing] = rendererContractCases(unstable, {
      supported: [markdownFile],
      unsupported: [htmlFile],
    }).filter((entry) => entry.name.includes("deterministically"));

    await expect(runCase(failing)).rejects.toThrow(/different trees/);
  });

  it("rejects a renderer producing an invalid tree", async () => {
    const broken: Renderer = {
      id: "broken",
      supports: (candidate) => candidate.format === "markdown",
      render: () => ({
        root: {
          type: "document",
          children: [{ type: "link", url: "", children: [] } as never],
        },
      }),
    };
    const [failing] = rendererContractCases(broken, {
      supported: [markdownFile],
      unsupported: [htmlFile],
    }).filter((entry) => entry.name.includes("structurally valid"));

    await expect(runCase(failing)).rejects.toThrow(/invalid tree/);
  });

  it("refuses to pass with no samples", async () => {
    const [, guard] = rendererContractCases(fakeRenderer("x", "markdown"), {
      supported: [],
      unsupported: [],
    });

    await expect(runCase(guard)).rejects.toThrow(
      /at least one supported sample/,
    );
  });
});

describe("selectRenderer", () => {
  const markdown = fakeRenderer("markdown", "markdown");
  const html = fakeRenderer("html", "html");

  it("chooses the renderer that claims the document", () => {
    const selection = selectRenderer([markdown, html], markdownFile);

    expect(selection.kind).toBe("selected");
    if (selection.kind !== "selected") {
      return;
    }
    expect(selection.renderer.id).toBe("markdown");
  });

  it("does not depend on registration order", () => {
    const forwards = selectRenderer([markdown, html], htmlFile);
    const backwards = selectRenderer([html, markdown], htmlFile);

    expect(forwards).toEqual(backwards);
  });

  it("reports an actionable diagnostic when nothing matches", () => {
    const selection = selectRenderer([html], markdownFile);

    expect(selection.kind).toBe("unresolved");
    if (selection.kind !== "unresolved") {
      return;
    }
    expect(selection.diagnostic.code).toBe(rendererCodes.noRenderer);
    // Names both the file and what was registered, so the fix is obvious.
    expect(selection.diagnostic.message).toContain("docs/a.md");
    expect(selection.diagnostic.message).toContain("html");
  });

  it("treats ambiguity as an error rather than a tie-break", () => {
    // Picking the first would hide a misconfiguration behind output that is
    // subtly wrong and very hard to trace back.
    const other = fakeRenderer("markdown-alternative", "markdown");
    const selection = selectRenderer([markdown, other], markdownFile);

    expect(selection.kind).toBe("unresolved");
    if (selection.kind !== "unresolved") {
      return;
    }
    expect(selection.diagnostic.code).toBe(rendererCodes.ambiguous);
    expect(selection.diagnostic.message).toContain("markdown-alternative");
  });

  it("rejects two renderers sharing an id", () => {
    const selection = selectRenderer(
      [markdown, fakeRenderer("markdown", "html")],
      markdownFile,
    );

    expect(selection.kind).toBe("unresolved");
    if (selection.kind !== "unresolved") {
      return;
    }
    expect(selection.diagnostic.code).toBe(rendererCodes.duplicateId);
  });

  it("reports no match for an empty registry", () => {
    const selection = selectRenderer([], markdownFile);

    expect(selection.kind).toBe("unresolved");
    if (selection.kind !== "unresolved") {
      return;
    }
    expect(selection.diagnostic.message).toContain("none");
  });
});

describe("renderDocument", () => {
  const markdown = fakeRenderer("markdown", "markdown");

  it("advances the document to the rendered stage", async () => {
    const result = await renderDocument([markdown], markdownFile);

    expect(result.stage).toBe("rendered");
    if (result.stage !== "rendered") {
      return;
    }
    expect(result.root.type).toBe("document");
    // Identity survives the stage change.
    expect(result.id).toBe(markdownFile.id);
    expect(result.contentHash).toBe(markdownFile.contentHash);
  });

  it("keeps warnings without failing the document", async () => {
    const warning = {
      code: "fake/partial",
      severity: "warning" as const,
      message: "one construct was approximated",
    };
    const noisy: Renderer = {
      ...markdown,
      render: () => ({ root: treeFor("x"), diagnostics: [warning] }),
    };

    const result = await renderDocument([noisy], markdownFile);

    // A page with one unsupported construct is still a page worth serving.
    expect(result.stage).toBe("rendered");
    expect(result.diagnostics).toEqual([warning]);
  });

  it("keeps the document when no renderer matches", async () => {
    const result = await renderDocument([], markdownFile);

    expect(result.stage).toBe("loaded");
    expect(result.content).toBe(markdownFile.content);
    expect(result.diagnostics[0]?.code).toBe(rendererCodes.noRenderer);
  });

  it("normalizes a thrown renderer into a diagnostic and preserves the cause", async () => {
    const cause = new Error("the parser exploded");
    const throwing: Renderer = {
      ...markdown,
      render: () => {
        throw cause;
      },
    };

    const result = await renderDocument([throwing], markdownFile);

    expect(result.stage).toBe("loaded");
    const diagnostic = result.diagnostics[0];
    expect(diagnostic?.code).toBe(rendererCodes.threw);
    expect(diagnostic?.message).toContain("the parser exploded");
    // The original error stays reachable, so a stack trace is not lost.
    expect(diagnostic?.cause).toBe(cause);
  });

  it("normalizes a renderer that threw something that is not an Error", async () => {
    const throwing: Renderer = {
      ...markdown,
      render: () => {
        // A renderer wrapping a third-party parser cannot constrain what that
        // parser throws, and some throw strings.
        const parserFailure: unknown = "a string";
        throw parserFailure;
      },
    };

    const result = await renderDocument([throwing], markdownFile);

    expect(result.diagnostics[0]?.message).toContain("a string");
    expect(result.diagnostics[0]?.cause).toBe("a string");
  });

  it("awaits an asynchronous renderer", async () => {
    const asynchronous: Renderer = {
      ...markdown,
      render: async () => Promise.resolve({ root: treeFor("async") }),
    };

    const result = await renderDocument([asynchronous], markdownFile);

    expect(result.stage).toBe("rendered");
  });

  it("does not modify the document it was given", async () => {
    const before = JSON.stringify(markdownFile);
    await renderDocument([markdown], markdownFile);

    expect(JSON.stringify(markdownFile)).toBe(before);
  });
});

describe("what a renderer reports about the source", () => {
  it("carries declared metadata onto the rendered document", async () => {
    const renderer: Renderer = {
      id: "declares",
      supports: () => true,
      render: () => ({
        root: { type: "document", children: [] },
        metadata: [["hidden", true] as const],
      }),
    };

    const rendered = await renderDocument([renderer], document("a.md", "x"));

    // Front matter that never reaches the precedence rules is front matter the
    // author wrote for nothing.
    expect(rendered.metadata.values.get("hidden")).toBe(true);
  });

  it("carries a full HTML document's title", async () => {
    const renderer: Renderer = {
      id: "html-ish",
      supports: () => true,
      render: () => ({
        root: { type: "document", children: [] },
        htmlTitle: "From the title element",
      }),
    };

    const rendered = await renderDocument([renderer], document("a.html", "x"));

    expect(rendered.stage === "rendered" ? rendered.htmlTitle : undefined).toBe(
      "From the title element",
    );
  });
});
