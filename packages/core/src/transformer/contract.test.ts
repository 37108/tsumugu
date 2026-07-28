import { describe, expect, it } from "vitest";

import type { DocumentNode, SemanticNode } from "../ast/nodes.js";
import type { SourcePath } from "../document/paths.js";

import {
  runTransformers,
  transformerCodes,
  type Transformer,
} from "./contract.js";

const sourcePath = "guide/setup.md" as SourcePath;

function documentWithParagraph(value: string): DocumentNode {
  return {
    type: "document",
    children: [{ type: "paragraph", children: [{ type: "text", value }] }],
  };
}

/** Appends `suffix` to the document's first text node. */
function appending(id: string, suffix: string): Transformer {
  return {
    id,
    transform: (root) => {
      const first = root.children[0];
      if (first?.type !== "paragraph") {
        return root;
      }
      const text = first.children[0];
      if (text?.type !== "text") {
        return root;
      }
      return documentWithParagraph(`${text.value}${suffix}`);
    },
  };
}

function firstText(root: DocumentNode): string {
  const paragraph = root.children[0];
  if (paragraph?.type !== "paragraph") {
    return "";
  }
  const text = paragraph.children[0];
  return text?.type === "text" ? text.value : "";
}

describe("runTransformers", () => {
  it("returns the document unchanged when nothing is registered", async () => {
    const root = documentWithParagraph("as written");
    const result = await runTransformers([], root, { sourcePath });

    expect(result.root).toBe(root);
    expect(result.diagnostics).toEqual([]);
  });

  it("runs transformers in registration order", async () => {
    const result = await runTransformers(
      [appending("first", " one"), appending("second", " two")],
      documentWithParagraph("start"),
      { sourcePath },
    );

    expect(firstText(result.root)).toBe("start one two");
  });

  it("awaits an asynchronous transformer", async () => {
    const slow: Transformer = {
      id: "slow",
      transform: async (root) => {
        await Promise.resolve();
        return documentWithParagraph(`${firstText(root)} done`);
      },
    };

    const result = await runTransformers(
      [slow],
      documentWithParagraph("work"),
      {
        sourcePath,
      },
    );

    expect(firstText(result.root)).toBe("work done");
  });

  it("collects the diagnostics a transformer reports", async () => {
    const warning: Transformer = {
      id: "warner",
      transform: (root, context) => {
        context.report({
          code: "test/warned",
          severity: "warning",
          stage: "transformer",
          message: "Something worth mentioning.",
        });
        return root;
      },
    };

    const result = await runTransformers(
      [warning],
      documentWithParagraph("text"),
      { sourcePath },
    );

    expect(result.diagnostics.map((entry) => entry.code)).toEqual([
      "test/warned",
    ]);
  });

  it("names the transformer that threw and keeps the document", async () => {
    const failing: Transformer = {
      id: "explodes",
      transform: () => {
        throw new Error("no grammar for that");
      },
    };

    const result = await runTransformers(
      [failing, appending("after", " still ran")],
      documentWithParagraph("content"),
      { sourcePath },
    );

    const diagnostic = result.diagnostics[0];
    expect(diagnostic?.code).toBe(transformerCodes.threw);
    expect(diagnostic?.message).toContain("explodes");
    expect(diagnostic?.message).toContain("no grammar for that");
    // A failure costs its own transformer's work, not the rest of the pipeline.
    expect(firstText(result.root)).toBe("content still ran");
  });

  it("rejects a result that is not a document", async () => {
    const wrong: Transformer = {
      id: "returns-a-paragraph",
      transform: () =>
        ({ type: "paragraph", children: [] }) as unknown as DocumentNode,
    };

    const root = documentWithParagraph("kept");
    const result = await runTransformers([wrong], root, { sourcePath });

    expect(result.diagnostics[0]?.code).toBe(transformerCodes.invalidResult);
    expect(result.root).toBe(root);
  });

  it("runs only the first transformer registered under a duplicated id", async () => {
    const result = await runTransformers(
      [appending("same", " one"), appending("same", " two")],
      documentWithParagraph("start"),
      { sourcePath },
    );

    expect(firstText(result.root)).toBe("start one");
    expect(result.diagnostics[0]?.code).toBe(transformerCodes.duplicateId);
  });

  it("does not mutate the tree it is given", async () => {
    const root = documentWithParagraph("original");
    deepFreeze(root);

    // A transformer that tried to mutate would throw on a frozen object in
    // strict mode, so this proves the policy is kept rather than only typed.
    const result = await runTransformers(
      [appending("copies", " changed")],
      root,
      { sourcePath },
    );

    expect(firstText(root)).toBe("original");
    expect(firstText(result.root)).toBe("original changed");
  });
});

function deepFreeze(node: SemanticNode): void {
  Object.freeze(node);
  if ("children" in node) {
    Object.freeze(node.children);
    for (const child of node.children) {
      deepFreeze(child);
    }
  }
}
