/**
 * How wide a label is, without a browser.
 *
 * This is the reason Tsumugu draws its own diagrams rather than running
 * Mermaid's renderer on the server. Mermaid asks the DOM to measure text, and a
 * DOM emulation cannot answer: measured against Mermaid 11.16 under jsdom, a
 * five-node flowchart came out 41216px wide (ADR 9). So the measurement is
 * ours, it is a table, and it is deterministic — the same label is the same
 * width on every machine and in every build, which is what caching and
 * byte-identical output require.
 *
 * It is an approximation of the theme's sans-serif stack, and it does not have
 * to be exact. What it has to be is *never too small*: a box narrower than its
 * label is a diagram with text hanging out of it, while a box slightly wider
 * than its label is a diagram with slightly more air in it.
 */

/** Advance width per character, as a fraction of the font size. */
const narrow = new Set([..."ijltfrI.,:;'\"`|!()[]{}-"]);
const wide = new Set([..."mwMW@%&"]);
const digitsAndCapitals = /^[A-Z0-9]$/u;

/**
 * Code points that occupy a full em.
 *
 * CJK ideographs, kana, Hangul and the full-width forms. A Japanese label
 * measured with Latin advance widths is half the width it needs, which is the
 * one failure mode that would make this table worse than useless — the
 * project's own documentation is written in two languages.
 *
 * Written as script properties rather than as a list of ranges, so an ideograph
 * outside the basic plane — 𠮷, and every other Extension B character — is
 * matched by the same rule as one inside it. The two loose marks are listed
 * separately: the prolonged sound mark ー is script Common rather than Katakana,
 * so レンダラー would otherwise be measured as four wide characters and one
 * narrow one.
 */
const fullWidth =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u{3000}-\u{303F}\u{30FB}-\u{30FC}\u{31F0}-\u{31FF}\u{FF01}-\u{FF60}\u{FFE0}-\u{FFE6}]/u;

/** One character's advance, as a fraction of the font size. */
function advance(character: string): number {
  if (fullWidth.test(character)) {
    return 1;
  }
  if (narrow.has(character)) {
    return 0.34;
  }
  if (wide.has(character)) {
    return 0.92;
  }
  if (character === " ") {
    return 0.28;
  }
  return digitsAndCapitals.test(character) ? 0.66 : 0.55;
}

/** How wide `text` is at `fontSize`, in the same units as the drawing. */
export function textWidth(text: string, fontSize: number): number {
  let total = 0;
  // Iterated by code point, so an emoji or an ideograph outside the BMP counts
  // once rather than twice.
  for (const character of text) {
    total += advance(character) * fontSize;
  }
  return Math.round(total * 100) / 100;
}

/** The tallest a single line of text can be at `fontSize`. */
export function lineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.35 * 100) / 100;
}
