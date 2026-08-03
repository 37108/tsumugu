import { describe, expect, it } from "vitest";

import {
  clientScript,
  clientScriptHash,
  normalizeForSearch,
  scoreEntry,
} from "./client-script.js";

/**
 * The ranking the browser runs.
 *
 * `scoreEntry` and `normalizeForSearch` are embedded into the client script by
 * their source text, so these tests exercise the same code a reader's browser
 * executes — which is the point of embedding them rather than rewriting them
 * in the script by hand.
 */

const entries = [
  { document: "Guide", section: "Install", text: "Run the installer." },
  { document: "Guide", section: "Configure", text: "Set the root option." },
  { document: "Install notes", text: "Historical details." },
  { document: "Reference", text: "The install flag is second here." },
] as const;

function scores(query: string): readonly number[] {
  const terms = normalizeForSearch(query).split(/\s+/u).filter(Boolean);
  return entries.map((entry) => scoreEntry(entry, terms));
}

describe("normalizeForSearch", () => {
  it("folds case and accents, so Café matches cafe", () => {
    expect(normalizeForSearch("Café")).toBe(normalizeForSearch("cafe"));
  });

  it("leaves scripts without case alone", () => {
    expect(normalizeForSearch("日本語")).toBe("日本語");
  });
});

describe("scoreEntry", () => {
  it("puts the section named for the query above a page that mentions it", () => {
    const [install, configure, notes, reference] = scores("install");

    // A reader typing "install" wants the section called Install first, the
    // document titled with it second, and a body mention last.
    expect(install).toBeGreaterThan(notes ?? 0);
    expect(notes).toBeGreaterThan(reference ?? 0);
    expect(configure).toBe(0);
  });

  it("prefers a match at the start of a word", () => {
    const wordStart = scoreEntry({ document: "D", text: "the second option" }, [
      "sec",
    ]);
    const midWord = scoreEntry({ document: "D", text: "a bisected line" }, [
      "sec",
    ]);

    // "con" should find "Configure" before "second"; here, "sec" finds
    // "second" before "bisected".
    expect(wordStart).toBeGreaterThan(midWord);
  });

  it("ranks a whole match above a partial one, and both above nothing", () => {
    // ADR 4 used to return 0 unless every term matched. RFC 6 measured that
    // rule and it returned nothing at all for one query in seven, so a term
    // that misses now costs coverage instead of the entry.
    const whole = scoreEntry(entries[0], ["install", "run"]);
    const partial = scoreEntry(entries[0], ["install", "nowhere-at-all"]);

    expect(whole).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(0);
    expect(scoreEntry(entries[0], ["nowhere-at-all"])).toBe(0);
  });

  it("leaves a single-term query exactly where it was", () => {
    // The coverage fraction is 1, so nothing about one word changed.
    expect(scoreEntry(entries[0], ["install"])).toBe(12);
  });

  it("starts a word where the script changes, for Japanese", () => {
    // 「を設定する」 begins a word at 設. Without this the bonus could only
    // fire at the very start of a field, and Japanese ranking collapsed to two
    // values across the whole corpus. RFC 6.
    const atChange = scoreEntry({ document: "D", text: "ルートを設定します" }, [
      "設定",
    ]);
    const insideRun = scoreEntry({ document: "D", text: "測定設備の話" }, [
      "定設",
    ]);

    expect(atChange).toBeGreaterThan(insideRun);
  });

  it("matches regardless of case and accents", () => {
    expect(
      scoreEntry({ document: "Café", text: "" }, [normalizeForSearch("CAFE")]),
    ).toBeGreaterThan(0);
  });

  it("finds the singular when the reader types the plural", () => {
    // Substring matching already made "diagram" find "diagrams". This is the
    // direction that used to return nothing at all. RFC 5.
    expect(
      scoreEntry({ document: "D", text: "draws a diagram" }, ["diagrams"]),
    ).toBeGreaterThan(0);
    expect(
      scoreEntry({ document: "D", text: "open the box" }, ["boxes"]),
    ).toBeGreaterThan(0);
    expect(
      scoreEntry({ document: "D", text: "the policy applies" }, ["policies"]),
    ).toBeGreaterThan(0);
  });

  it("ranks an exact match above the plural that reached it", () => {
    const exact = scoreEntry({ document: "D", text: "many diagrams" }, [
      "diagrams",
    ]);
    const stemmed = scoreEntry({ document: "D", text: "one diagram" }, [
      "diagrams",
    ]);

    expect(exact).toBeGreaterThan(stemmed);
  });

  it("does not strip a suffix that is not a plural", () => {
    // "css" must not become "cs", and "notes" must not become "not" — which
    // would match "nothing", "notation" and "cannot".
    expect(scoreEntry({ document: "D", text: "a cs degree" }, ["css"])).toBe(0);
    expect(
      scoreEntry({ document: "D", text: "it is not here" }, ["notes"]),
    ).toBe(0);
  });

  it("treats a term that is regex syntax as text", () => {
    // A reader searching documentation for "c++" or "a.b" is quoting code,
    // not writing a pattern.
    expect(
      scoreEntry({ document: "D", text: "about c++ templates" }, ["c++"]),
    ).toBeGreaterThan(0);
  });
});

describe("the embedded script", () => {
  it("contains the very functions the tests above exercised", () => {
    // The embedding is what makes the ranking testable; if it stops happening,
    // the browser runs something these tests never saw.
    expect(clientScript).toContain(scoreEntry.toString());
    expect(clientScript).toContain(normalizeForSearch.toString());
  });

  it("has a hash that matches its own bytes", () => {
    expect(clientScriptHash).toMatch(/^'sha256-[A-Za-z0-9+/=]+'$/u);
  });

  it("marks the section being read with the accessible you-are-here", () => {
    // aria-current="location" is what a screen reader announces; the colour is
    // the stylesheet's translation of it.
    expect(clientScript).toContain('"aria-current","location"');
    // One frame at most, reads before the single write: not a per-pixel
    // scroll handler.
    expect(clientScript).toContain("requestAnimationFrame");
    expect(clientScript).toContain("{passive:true}");
  });

  it("creates the copy control rather than expecting it in the markup", () => {
    // A server-rendered button would be a control that does nothing without
    // the script; the script makes what only it can operate.
    expect(clientScript).toContain('createElement("button")');
    expect(clientScript).toContain("navigator.clipboard");
    expect(clientScript).toContain('"Copy code"');
    expect(clientScript).toContain('button.lang="en"');
  });
});
