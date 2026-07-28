#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// Resolved to the CLI's real JavaScript entry and run with this Node, because
// the bin shim in node_modules/.bin is a .cmd on Windows, which Node refuses
// to spawn without a shell.
const require = createRequire(import.meta.url);
const tailwind = path.join(
  path.dirname(require.resolve("@tailwindcss/cli/package.json")),
  "dist",
  "index.mjs",
);

/**
 * Compiles the authored Tailwind stylesheets into the TypeScript constants
 * the shell and the theme actually ship.
 *
 * Authoring happens in CSS files with Tailwind's vocabulary; what ships is
 * still one inline stylesheet string per owner, so the content-security
 * policy, the no-network rule and the runtime dependency count (zero) are
 * exactly what they were when the styles were written by hand.
 *
 * The generated files are committed. `pnpm run build` regenerates them, and
 * `node scripts/build-styles.mjs --check` — run by the test suite — fails
 * when a generated file was edited directly or drifted from its source.
 */

const entries = [
  {
    source: "packages/core/src/shell/shell.css",
    target: "packages/core/src/shell/stylesheet.ts",
    exportName: "shellStylesheet",
    doc: [
      "/**",
      " * The application shell's stylesheet.",
      " *",
      " * GENERATED from `shell.css` by `scripts/build-styles.mjs` — edit the",
      " * CSS, then run `pnpm styles`. The authored file carries the reasoning;",
      " * this one carries the bytes the pages ship.",
      " */",
    ],
  },
  {
    source: "packages/theme-default/src/theme.css",
    target: "packages/theme-default/src/stylesheet.ts",
    exportName: "stylesheet",
    doc: [
      "/**",
      " * The default theme's stylesheet.",
      " *",
      " * GENERATED from `theme.css` by `scripts/build-styles.mjs` — edit the",
      " * CSS, then run `pnpm styles`. The authored file carries the reasoning;",
      " * this one carries the bytes the pages ship.",
      " */",
    ],
  },
];

const check = process.argv.includes("--check");
const scratch = mkdtempSync(path.join(tmpdir(), "tsumugu-styles-"));
let failed = false;

try {
  for (const entry of entries) {
    const out = path.join(scratch, path.basename(entry.target) + ".css");
    execFileSync(process.execPath, [tailwind, "-i", entry.source, "-o", out], {
      stdio: ["ignore", "ignore", "inherit"],
    });

    const css = readFileSync(out, "utf8")
      .replace(/^\/\*! tailwindcss [^*]*\*\/\n?/u, "")
      .trim();

    const banner = [...entry.doc, `export const ${entry.exportName} = \``].join(
      "\n",
    );

    const escaped = css
      .replaceAll("\\", "\\\\")
      .replaceAll("`", "\\`")
      .replaceAll("${", "\\${");
    const generated = `${banner}\n${escaped}\n\`;\n`;

    if (check) {
      const current = readFileSync(entry.target, "utf8");
      if (current !== generated) {
        console.error(`${entry.target} is stale. Run: pnpm styles`);
        failed = true;
      }
    } else {
      writeFileSync(entry.target, generated);
      console.log(`${entry.target} <- ${entry.source}`);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failed) {
  process.exit(1);
}
