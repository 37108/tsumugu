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
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },

  js.configs.recommended,

  // Type-aware linting. The rules the repository actually needs — floating
  // promises, misused promises, unsafe `any` flow — cannot be detected without
  // type information, so the non-type-checked preset would not be enough.
  tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // The project service resolves each file through the tsconfig that owns
        // it, so packages and tests do not have to be enumerated here and
        // cannot drift out of sync with the TypeScript project references.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    // The configuration files are plain JavaScript and belong to no TypeScript
    // project, so type-aware rules cannot run on them.
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
