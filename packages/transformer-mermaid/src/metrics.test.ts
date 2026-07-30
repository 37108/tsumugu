import { describe, expect, it } from "vitest";

import { lineHeight, textWidth } from "./metrics.js";

/**
 * The measurement that replaces a DOM.
 *
 * It does not have to match a font exactly. It has to be deterministic, and it
 * has to never come out too small — a box narrower than its label is a diagram
 * with text hanging out of it (ADR 9).
 */

describe("measuring a label", () => {
  it("gives the same answer every time", () => {
    expect(textWidth("Renderer", 13)).toBe(textWidth("Renderer", 13));
  });

  it("grows with the text and with the font size", () => {
    expect(textWidth("Renderer", 13)).toBeGreaterThan(textWidth("Ren", 13));
    expect(textWidth("Renderer", 26)).toBeGreaterThan(
      textWidth("Renderer", 13),
    );
  });

  it("counts a full-width character as an em", () => {
    // A Japanese label measured with Latin widths comes out about half the
    // width it needs, which is the one failure that puts text outside its box.
    expect(textWidth("走査", 13)).toBe(26);
    expect(textWidth("レンダラー", 13)).toBe(65);
    expect(textWidth("走査", 13)).toBeGreaterThan(textWidth("ab", 13));
  });

  it("counts a character outside the basic plane once", () => {
    // Iterating by code unit would count an astral character twice.
    expect(textWidth("𠮷", 13)).toBe(13);
  });

  it("gives a narrow character less room than a wide one", () => {
    expect(textWidth("iii", 13)).toBeLessThan(textWidth("mmm", 13));
  });

  it("gives an empty label no width", () => {
    expect(textWidth("", 13)).toBe(0);
  });

  it("makes a line taller than the text it holds", () => {
    expect(lineHeight(13)).toBeGreaterThan(13);
  });
});
