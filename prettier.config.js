/**
 * Prettier owns all formatting, for TypeScript, JavaScript, JSON, Markdown and
 * YAML alike. Defaults are kept wherever they are reasonable, so this file only
 * records the choices that are not defaults or that are not safe to leave
 * implicit.
 *
 * @type {import("prettier").Config}
 */
export default {
  // Stated explicitly rather than relying on the default. Git on Windows can be
  // configured to check files out with CRLF, and without this the formatter
  // would produce different output there than on Linux and macOS.
  endOfLine: "lf",
};
