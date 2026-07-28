import { describe, expect, it } from "vitest";

import type { DocumentNode } from "../ast/nodes.js";
import {
  toDocumentMetadata,
  type MetadataValue,
} from "../document/metadata.js";
import { toSourcePath, type SourcePath } from "../document/paths.js";
import {
  compareForNavigation,
  metadataCodes,
  resolveMetadata,
  titleFromFileName,
  type ResolvedMetadata,
} from "./resolve.js";

function sourcePath(value: string): SourcePath {
  const result = toSourcePath(value);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function frontMatter(
  ...entries: readonly (readonly [string, MetadataValue])[]
): ReturnType<typeof toDocumentMetadata> {
  return toDocumentMetadata(entries);
}

function documentWithHeading(depth: 1 | 2, text: string): DocumentNode {
  return {
    type: "document",
    children: [
      { type: "heading", depth, children: [{ type: "text", value: text }] },
    ],
  };
}

const path = sourcePath("docs/getting-started.md");

describe("title precedence", () => {
  it("prefers front matter above everything", () => {
    const resolved = resolveMetadata({
      sourcePath: path,
      metadata: frontMatter(["title", "From front matter"]),
      htmlTitle: "From HTML",
      root: documentWithHeading(1, "From heading"),
    });

    expect(resolved.title).toBe("From front matter");
    expect(resolved.titleSource).toBe("front-matter");
  });

  it("falls back to an HTML title", () => {
    const resolved = resolveMetadata({
      sourcePath: path,
      metadata: frontMatter(),
      htmlTitle: "From HTML",
      root: documentWithHeading(1, "From heading"),
    });

    expect(resolved.title).toBe("From HTML");
    expect(resolved.titleSource).toBe("html-title");
  });

  it("falls back to the first level-one heading", () => {
    const resolved = resolveMetadata({
      sourcePath: path,
      metadata: frontMatter(),
      root: documentWithHeading(1, "From heading"),
    });

    expect(resolved.title).toBe("From heading");
    expect(resolved.titleSource).toBe("heading");
  });

  it("falls back to the file name", () => {
    const resolved = resolveMetadata({
      sourcePath: path,
      metadata: frontMatter(),
    });

    expect(resolved.title).toBe("Getting started");
    expect(resolved.titleSource).toBe("file-name");
  });

  it("ignores a heading that is not level one", () => {
    // A level-two heading is a section, not the document's title.
    const resolved = resolveMetadata({
      sourcePath: path,
      metadata: frontMatter(),
      root: documentWithHeading(2, "A section"),
    });

    expect(resolved.titleSource).toBe("file-name");
  });

  it("uses the first level-one heading when there are several", () => {
    const root: DocumentNode = {
      type: "document",
      children: [
        {
          type: "heading",
          depth: 1,
          children: [{ type: "text", value: "First" }],
        },
        {
          type: "heading",
          depth: 1,
          children: [{ type: "text", value: "Second" }],
        },
      ],
    };

    expect(
      resolveMetadata({ sourcePath: path, metadata: frontMatter(), root })
        .title,
    ).toBe("First");
  });

  it("reads a heading's nested text", () => {
    const root: DocumentNode = {
      type: "document",
      children: [
        {
          type: "heading",
          depth: 1,
          children: [
            { type: "text", value: "Using " },
            { type: "inline-code", value: "tsumugu dev" },
          ],
        },
      ],
    };

    expect(
      resolveMetadata({ sourcePath: path, metadata: frontMatter(), root })
        .title,
    ).toBe("Using tsumugu dev");
  });

  it.each([
    ["an empty string", ""],
    ["only whitespace", "   "],
  ])(
    "does not let %s in front matter suppress a lower fallback",
    (_label, value) => {
      // An author who wrote `title:` by accident should still get their heading,
      // not a page called "".
      const resolved = resolveMetadata({
        sourcePath: path,
        metadata: frontMatter(["title", value]),
        root: documentWithHeading(1, "From heading"),
      });

      expect(resolved.title).toBe("From heading");
      expect(resolved.titleSource).toBe("heading");
    },
  );

  it("skips an empty HTML title", () => {
    const resolved = resolveMetadata({
      sourcePath: path,
      metadata: frontMatter(),
      htmlTitle: "   ",
      root: documentWithHeading(1, "From heading"),
    });

    expect(resolved.titleSource).toBe("heading");
  });

  it("skips an empty heading", () => {
    const resolved = resolveMetadata({
      sourcePath: path,
      metadata: frontMatter(),
      root: documentWithHeading(1, "  "),
    });

    expect(resolved.titleSource).toBe("file-name");
  });

  it("warns and falls back when the title is not text", () => {
    const resolved = resolveMetadata({
      sourcePath: path,
      metadata: frontMatter(["title", 2026]),
      root: documentWithHeading(1, "From heading"),
    });

    expect(resolved.title).toBe("From heading");
    expect(resolved.diagnostics[0]?.code).toBe(metadataCodes.invalidTitle);
    expect(resolved.diagnostics[0]?.severity).toBe("warning");
  });

  it("behaves identically for a Markdown and an HTML source", () => {
    // The whole reason precedence lives in one place: an HTML page and a
    // Markdown page with the same meaning must not disagree about their title.
    const shared = {
      metadata: frontMatter(),
      root: documentWithHeading(1, "Install"),
    };
    const markdown = resolveMetadata({
      ...shared,
      sourcePath: sourcePath("docs/install.md"),
    });
    const html = resolveMetadata({
      ...shared,
      sourcePath: sourcePath("docs/install.html"),
    });

    expect(html.title).toBe(markdown.title);
    expect(html.titleSource).toBe(markdown.titleSource);
  });
});

describe("titleFromFileName", () => {
  it.each([
    ["docs/getting-started.md", "Getting started"],
    ["docs/getting_started.md", "Getting started"],
    ["docs/install.html", "Install"],
    ["readme.md", "Readme"],
  ])("turns %s into %s", (input, expected) => {
    expect(titleFromFileName(sourcePath(input))).toBe(expected);
  });

  it("names an index file after its directory", () => {
    // "docs/guide/" shown as "Index" tells a reader nothing.
    expect(titleFromFileName(sourcePath("docs/guide/index.md"))).toBe("Guide");
    expect(titleFromFileName(sourcePath("docs/api-reference/index.html"))).toBe(
      "Api reference",
    );
  });

  it("keeps numeric prefixes", () => {
    // Silently deciding that part of a name the author typed is decoration is
    // exactly what the file-system-first principle warns against. Front matter
    // is the explicit override.
    expect(titleFromFileName(sourcePath("docs/01-install.md"))).toBe(
      "01 install",
    );
  });

  it("does not modify the source path", () => {
    const original = sourcePath("docs/01-install.md");
    titleFromFileName(original);

    expect(original).toBe("docs/01-install.md");
  });

  it("handles a name that is only separators", () => {
    expect(titleFromFileName(sourcePath("docs/--.md"))).toBe("--");
  });
});

describe("order", () => {
  it("accepts a finite number", () => {
    expect(
      resolveMetadata({ sourcePath: path, metadata: frontMatter(["order", 3]) })
        .order,
    ).toBe(3);
  });

  it("accepts a negative number, so a page can be pinned to the top", () => {
    expect(
      resolveMetadata({
        sourcePath: path,
        metadata: frontMatter(["order", -1]),
      }).order,
    ).toBe(-1);
  });

  it.each([
    ["a string", "3"],
    ["a boolean", true],
    ["a list", [1]],
    ["null", null],
  ] as readonly (readonly [string, MetadataValue])[])(
    "warns and ignores %s",
    (_label, value) => {
      const resolved = resolveMetadata({
        sourcePath: path,
        metadata: frontMatter(["order", value]),
      });

      expect(resolved.order).toBeUndefined();
      expect(resolved.diagnostics[0]?.code).toBe(metadataCodes.invalidOrder);
    },
  );
});

describe("hidden", () => {
  it("defaults to visible", () => {
    expect(
      resolveMetadata({ sourcePath: path, metadata: frontMatter() }).hidden,
    ).toBe(false);
  });

  it("accepts a boolean", () => {
    expect(
      resolveMetadata({
        sourcePath: path,
        metadata: frontMatter(["hidden", true]),
      }).hidden,
    ).toBe(true);
  });

  it("warns and stays visible for a non-boolean", () => {
    // Guessing at "no" or "false" is too easy to get backwards, and getting it
    // backwards publishes a page the author wanted hidden.
    const resolved = resolveMetadata({
      sourcePath: path,
      metadata: frontMatter(["hidden", "yes"]),
    });

    expect(resolved.hidden).toBe(false);
    expect(resolved.diagnostics[0]?.code).toBe(metadataCodes.invalidHidden);
  });
});

describe("description", () => {
  it("is omitted when absent", () => {
    expect(
      resolveMetadata({ sourcePath: path, metadata: frontMatter() })
        .description,
    ).toBeUndefined();
  });

  it("is trimmed", () => {
    expect(
      resolveMetadata({
        sourcePath: path,
        metadata: frontMatter(["description", "  How to install.  "]),
      }).description,
    ).toBe("How to install.");
  });

  it("warns and omits a non-text description", () => {
    const resolved = resolveMetadata({
      sourcePath: path,
      metadata: frontMatter(["description", 42]),
    });

    expect(resolved.description).toBeUndefined();
    expect(resolved.diagnostics[0]?.code).toBe(
      metadataCodes.invalidDescription,
    );
  });
});

describe("unknown keys", () => {
  it("are left in the document's metadata and never become settings", () => {
    const metadata = frontMatter(["audience", "internal"], ["title", "A"]);
    const resolved = resolveMetadata({ sourcePath: path, metadata });

    // Preserved where the author put them, and absent from the resolved result.
    expect(metadata.values.get("audience")).toBe("internal");
    expect(Object.keys(resolved).sort()).toEqual(
      ["diagnostics", "hidden", "title", "titleSource"].sort(),
    );
    expect(resolved.diagnostics).toEqual([]);
  });
});

describe("determinism", () => {
  it("produces the same result and diagnostics every time", () => {
    const sources = {
      sourcePath: path,
      metadata: frontMatter(["order", "nope"], ["hidden", "nope"]),
    };

    expect(resolveMetadata(sources)).toEqual(resolveMetadata(sources));
  });

  it("reports every problem it found, not just the first", () => {
    const resolved = resolveMetadata({
      sourcePath: path,
      metadata: frontMatter(
        ["title", 1],
        ["description", 2],
        ["order", "x"],
        ["hidden", "x"],
      ),
    });

    expect(resolved.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      metadataCodes.invalidTitle,
      metadataCodes.invalidDescription,
      metadataCodes.invalidOrder,
      metadataCodes.invalidHidden,
    ]);
  });
});

describe("compareForNavigation", () => {
  function entry(title: string, order?: number): ResolvedMetadata {
    return {
      title,
      titleSource: "front-matter",
      hidden: false,
      diagnostics: [],
      ...(order === undefined ? {} : { order }),
    };
  }

  it("sorts explicit order first, lowest first", () => {
    const sorted = [entry("B", 2), entry("A", 1)].sort(compareForNavigation);

    expect(sorted.map((item) => item.title)).toEqual(["A", "B"]);
  });

  it("puts pages without an order after those with one", () => {
    const sorted = [entry("A"), entry("Z", 10)].sort(compareForNavigation);

    expect(sorted.map((item) => item.title)).toEqual(["Z", "A"]);
  });

  it("falls back to the title so the result is stable without any order", () => {
    const sorted = [entry("Charlie"), entry("alpha"), entry("Bravo")].sort(
      compareForNavigation,
    );

    // Locale-independent on purpose: a sidebar must not reorder itself
    // depending on the machine that generated it.
    expect(sorted.map((item) => item.title)).toEqual([
      "Bravo",
      "Charlie",
      "alpha",
    ]);
  });

  it("breaks an order tie by title", () => {
    const sorted = [entry("B", 1), entry("A", 1)].sort(compareForNavigation);

    expect(sorted.map((item) => item.title)).toEqual(["A", "B"]);
  });
});

describe("typo detection", () => {
  function resolved(entries: readonly (readonly [string, MetadataValue])[]) {
    return resolveMetadata({
      sourcePath: path,
      metadata: toDocumentMetadata(entries),
    });
  }

  it.each([
    ["hiden", "hidden"],
    ["titel", "title"],
    ["oder", "order"],
    ["descriptio", "description"],
    ["hiddenn", "hidden"],
  ])("suggests the known key for %j", (typo, known) => {
    const result = resolved([[typo, true]]);

    const warning = result.diagnostics.find(
      (diagnostic) => diagnostic.code === metadataCodes.unknownKeyTypo,
    );
    expect(warning?.message).toContain(`"${typo}"`);
    expect(warning?.message).toContain(`"${known}"`);
  });

  it("stays silent for keys that are not near any known one", () => {
    // The preserved-keys policy: an author saying something Tsumugu has no
    // feature for is not a mistake.
    for (const key of ["audience", "owner", "draft", "tags"]) {
      expect(
        resolved([[key, "x"]]).diagnostics.map((entry) => entry.code),
      ).not.toContain(metadataCodes.unknownKeyTypo);
    }
  });

  it("does not warn about the known keys themselves", () => {
    expect(
      resolved([
        ["title", "T"],
        ["hidden", true],
      ]).diagnostics,
    ).toEqual([]);
  });
});
