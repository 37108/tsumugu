import { describe, expect, it } from "vitest";

import { createPreset, officialComposition } from "./index.js";

/**
 * What "zero configuration" currently means.
 *
 * These tests exist to make a change to the defaults visible in a diff. A
 * default that can drift without anyone noticing is not a default.
 */
describe("createPreset", () => {
  it("registers the official renderers, in order", () => {
    expect(createPreset().renderers.map((renderer) => renderer.id)).toEqual([
      ...officialComposition.renderers,
    ]);
  });

  it("registers the official transformers, in order", () => {
    // Order carries meaning: identifiers are resolved before highlighting, so a
    // heading is addressable whatever a later transformer does.
    expect(
      createPreset().transformers.map((transformer) => transformer.id),
    ).toEqual([...officialComposition.transformers]);
  });

  it("selects the official theme", () => {
    expect(createPreset().theme.id).toBe(officialComposition.theme);
  });

  it("returns a fresh composition each time", () => {
    // Two servers in one process must not share a transformer's state.
    expect(createPreset().transformers[0]).not.toBe(
      createPreset().transformers[0],
    );
  });

  it("lets a caller replace the renderers", () => {
    const preset = createPreset({
      renderers: [
        {
          id: "only-mine",
          supports: () => true,
          render: () => ({ root: { type: "document", children: [] } }),
        },
      ],
    });

    expect(preset.renderers.map((renderer) => renderer.id)).toEqual([
      "only-mine",
    ]);
    // Replacing one stage leaves the others alone.
    expect(preset.theme.id).toBe(officialComposition.theme);
  });

  it("lets a caller turn every transformer off", () => {
    expect(createPreset({ transformers: [] }).transformers).toEqual([]);
  });

  it("lets a caller replace the theme", () => {
    const preset = createPreset({ theme: { id: "mine", renderers: {} } });

    expect(preset.theme.id).toBe("mine");
    expect(preset.renderers).toHaveLength(2);
  });

  it("composes with the defaults rather than replacing them, when spread", () => {
    const preset = createPreset();
    const extended = [
      ...preset.transformers,
      { id: "mine", transform: (root: unknown) => root },
    ];

    expect(extended.map((transformer) => transformer.id)).toEqual([
      ...officialComposition.transformers,
      "mine",
    ]);
  });
});

describe("the trust option", () => {
  const scriptDocument = {
    stage: "loaded",
    id: "docs/a.html",
    sourcePath: "docs/a.html",
    format: "html",
    stat: { size: 1, modifiedAtMs: 1 },
    contentHash: "hash",
    content: '<p>a</p><script>console.log("hi");</script>',
    metadata: { values: new Map() },
    route: "/a",
    diagnostics: [],
  } as unknown as Parameters<
    ReturnType<typeof createPreset>["renderers"][number]["render"]
  >[0];

  it("composes script-preserving renderers under trust", async () => {
    const preset = createPreset({ trust: true });
    const html = preset.renderers.find((renderer) => renderer.id === "html");

    const result = await html?.render(scriptDocument);
    expect(result?.scripts).toEqual(['console.log("hi");']);
  });

  it("composes script-removing renderers otherwise", async () => {
    const preset = createPreset();
    const html = preset.renderers.find((renderer) => renderer.id === "html");

    const result = await html?.render(scriptDocument);
    expect(result?.scripts ?? []).toHaveLength(0);
  });
});
