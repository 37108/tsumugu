import { describe, expect, it } from "vitest";

import type { DocumentNode } from "./nodes.js";
import { trustRawHtml } from "./trust.js";

describe("trustRawHtml", () => {
  it("marks every preserved node trusted, at any depth, and nothing else", () => {
    const document: DocumentNode = {
      type: "document",
      children: [
        {
          type: "raw-html",
          value: "<canvas></canvas>",
          trust: "untrusted",
          placement: "block",
        },
        {
          type: "paragraph",
          children: [
            { type: "text", value: "before " },
            {
              type: "raw-html",
              value: "<x-badge></x-badge>",
              trust: "untrusted",
              placement: "inline",
            },
          ],
        },
      ],
    };

    const declared = trustRawHtml(document);

    const block = declared.children[0];
    expect(block?.type === "raw-html" && block.trust).toBe("trusted");

    const paragraph = declared.children[1];
    const inline =
      paragraph?.type === "paragraph" ? paragraph.children[1] : undefined;
    expect(inline?.type === "raw-html" && inline.trust).toBe("trusted");

    const text =
      paragraph?.type === "paragraph" ? paragraph.children[0] : undefined;
    expect(text).toEqual({ type: "text", value: "before " });
  });

  it("leaves the original document untouched", () => {
    const document: DocumentNode = {
      type: "document",
      children: [
        {
          type: "raw-html",
          value: "<canvas></canvas>",
          trust: "untrusted",
          placement: "block",
        },
      ],
    };

    trustRawHtml(document);

    const original = document.children[0];
    expect(original?.type === "raw-html" && original.trust).toBe("untrusted");
  });
});
