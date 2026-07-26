import { defineConfig } from "vitest/config";

/**
 * A single Vitest run covers the whole workspace.
 *
 * Vitest "projects" are deliberately not configured. With two packages and one
 * repository-level suite they would add configuration without changing what
 * runs, and the test layers are already distinguishable by location. This
 * should be revisited when per-package environments or setup files start to
 * differ.
 */
export default defineConfig({
  test: {
    // Colocated unit tests live beside the source they cover; repository-level
    // tests live in tests/. Helpers under tests/helpers are not matched,
    // because they are support code rather than suites.
    include: ["packages/*/src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],

    coverage: {
      provider: "v8",
      // Text for the terminal, lcov for tooling, html for reading a report
      // locally. All three come from one run.
      reporter: ["text", "lcov", "html"],
      include: ["packages/*/src/**/*.ts"],
      // Test files and the compiled output are not subjects of coverage.
      exclude: ["**/*.test.ts", "**/dist/**"],
      // `thresholds` is deliberately absent. A percentage gate before the
      // document pipeline exists would measure how much code exists rather
      // than how well it is tested, which the issue lists as a non-goal.
    },
  },
});
