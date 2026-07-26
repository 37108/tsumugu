import { describe, expect, it } from "vitest";

import { version } from "@tsumugu/core";

import { run } from "./index.js";

/**
 * Unit tests for argument handling.
 *
 * `tests/cli.test.ts` covers the same commands end to end by executing the
 * emitted binary, which is what proves the build and the `bin` wiring work.
 * These tests cover the branches instead: they are fast, they need no build,
 * and they can enumerate cases that would be wasteful to spawn a process for.
 */
describe("run", () => {
  it("reports the version for --version", () => {
    expect(run(["--version"])).toEqual({
      stdout: `tsumugu ${version}\n`,
      stderr: "",
      exitCode: 0,
    });
  });

  it("accepts -v as an alias", () => {
    expect(run(["-v"])).toEqual(run(["--version"]));
  });

  it("writes usage to stderr and fails when given no arguments", () => {
    const result = run([]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Usage: tsumugu --version");
  });

  it.each([
    ["an unknown command", ["serve"]],
    ["an unknown flag", ["--port", "3000"]],
    ["a version flag with extra arguments", ["--version", "extra"]],
    ["a repeated version flag", ["--version", "--version"]],
    ["an empty first argument", [""]],
  ])("fails on %s", (_description, argv) => {
    const result = run(argv);

    expect(result.exitCode).toBe(1);
    // Nothing is written to stdout on failure, so a caller can pipe stdout
    // without capturing diagnostics.
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Usage: tsumugu --version");
  });

  it("does not treat the version flag as a prefix match", () => {
    expect(run(["--versions"]).exitCode).toBe(1);
    expect(run(["--version=true"]).exitCode).toBe(1);
  });
});
