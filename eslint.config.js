import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Linting is scoped to correctness, not style.
 *
 * Prettier owns every formatting decision, so no stylistic rule is enabled here
 * and there is nothing for the two tools to disagree about. That is why
 * `eslint-config-prettier` is not a dependency: ESLint's own formatting rules
 * were removed from the recommended sets, so there is no overlap left to
 * disable.
 */
export default tseslint.config(
  {
    // Build output, dependencies and coverage reports are generated, never
    // authored, so they are not linted.
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      // Documentation the MDX renderer's tests execute, not source this
      // repository compiles: the files are deliberately written the way an
      // author would write them, browser globals and JSX and all.
      "packages/renderer-mdx/test-fixtures/**",
    ],
  },

  js.configs.recommended,

  // Type-aware linting. The rules the repository actually needs — floating
  // promises, misused promises, unsafe `any` flow — cannot be detected without
  // type information, so the non-type-checked preset would not be enough.
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // The projects are listed explicitly rather than using the project
        // service. The service resolves each file through the *nearest*
        // tsconfig.json, which cannot work here: test files are deliberately
        // excluded from the package build projects so they never reach `dist/`,
        // and are type-checked by tsconfig.test.json instead. The service would
        // therefore refuse to parse every test file. Listing the projects
        // assigns each file to the configuration that actually type-checks it.
        project: ["./tsconfig.test.json", "./packages/*/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    // Configuration files and the benchmark script are plain JavaScript and
    // belong to no TypeScript project, so type-aware rules cannot run on them.
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    // Scripts run on Node.js, where `process`, `console` and `performance` are
    // globals. Everywhere else they are imported, which is why this is scoped
    // rather than declared for the whole repository.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        URL: "readonly",
        console: "readonly",
        performance: "readonly",
        process: "readonly",
      },
    },
  },
);
