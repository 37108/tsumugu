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

  it("requires every term to match somewhere", () => {
    expect(scoreEntry(entries[0], ["install", "nowhere-at-all"])).toBe(0);
    expect(scoreEntry(entries[0], ["install", "run"])).toBeGreaterThan(0);
  });

  it("matches regardless of case and accents", () => {
    expect(
      scoreEntry({ document: "Café", text: "" }, [normalizeForSearch("CAFE")]),
    ).toBeGreaterThan(0);
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

  it("creates the copy control rather than expecting it in the markup", () => {
    // A server-rendered button would be a control that does nothing without
    // the script; the script makes what only it can operate.
    expect(clientScript).toContain('createElement("button")');
    expect(clientScript).toContain("navigator.clipboard");
    expect(clientScript).toContain('"Copy code"');
  });
});
