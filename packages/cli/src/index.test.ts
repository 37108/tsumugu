import { describe, expect, it } from "vitest";

import { version } from "tsumugu-core";

import {
  describeStartup,
  discoverRoot,
  parseDevOptions,
  siteNameFor,
  type DevResult,
} from "./dev.js";
import { formatSize, parseBuildOptions } from "./build.js";
import { exitCodes, run, usage } from "./index.js";
import { formatForTerminal, styleFor } from "./terminal.js";

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
    expect(result.stderr).toContain("tsumugu dev");
  });

  it("prints help to stdout and succeeds for --help", () => {
    const result = run(["--help"]);

    // Asking for help is not a failure, so a script that pipes stdout gets the
    // help text rather than an empty stream and a non-zero code.
    expect(result.exitCode).toBe(exitCodes.ok);
    expect(result.stdout).toBe(usage);
    expect(result.stderr).toBe("");
  });

  it("accepts -h as an alias", () => {
    expect(run(["-h"])).toEqual(run(["--help"]));
  });

  it("documents only options that exist", () => {
    for (const option of ["--root", "--host", "--port", "--trust"]) {
      expect(usage).toContain(option);
    }
  });

  it("documents --trust for dev and for build", () => {
    expect(usage.match(/--trust/g)).toHaveLength(2);
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
    expect(result.stderr).toContain("tsumugu dev");
  });

  it("does not treat the version flag as a prefix match", () => {
    expect(run(["--versions"]).exitCode).toBe(1);
    expect(run(["--version=true"]).exitCode).toBe(1);
  });
});

describe("parseDevOptions", () => {
  it("takes the directory as a bare argument", () => {
    expect(parseDevOptions(["site"])).toEqual({
      ok: true,
      options: { root: "site" },
    });
  });

  it("takes the directory as --root", () => {
    expect(parseDevOptions(["--root", "site"])).toEqual({
      ok: true,
      options: { root: "site" },
    });
  });

  it("reads host and port", () => {
    expect(parseDevOptions(["--host", "0.0.0.0", "--port", "8080"])).toEqual({
      ok: true,
      options: { host: "0.0.0.0", port: 8080 },
    });
  });

  it("reads the --trust declaration", () => {
    expect(parseDevOptions(["--trust"])).toEqual({
      ok: true,
      options: { trust: true },
    });
  });

  it("names --trust when rejecting an unknown option", () => {
    const result = parseDevOptions(["--watch"]);

    expect(!result.ok && result.message).toContain("--trust");
  });

  it.each([
    ["a second bare argument", ["one", "two"]],
    ["an unknown flag", ["--watch"]],
    ["a flag with no value", ["--host"]],
    ["a port that is not a number", ["--port", "eighty"]],
    ["a port out of range", ["--port", "70000"]],
  ])("rejects %s", (_description, argv) => {
    const result = parseDevOptions(argv);

    expect(result.ok).toBe(false);
  });
});

describe("describeStartup", () => {
  const base = {
    server: { url: "http://127.0.0.1:4000/" },
    watching: true,
    diagnostics: [],
    pageCount: 1,
  };

  it("announces the trust declaration when it is active", () => {
    const result = { ...base, trust: true } as unknown as DevResult;

    expect(describeStartup(result, "/work/docs")).toContain("trust");
  });

  it("says nothing about trust otherwise", () => {
    const result = { ...base, trust: false } as unknown as DevResult;

    expect(describeStartup(result, "/work/docs")).not.toContain("trust");
  });
});

describe("siteNameFor", () => {
  it("names the project rather than the directory called docs", () => {
    expect(siteNameFor("/work/tsumugu/docs")).toBe("tsumugu");
  });

  it("uses the directory's own name otherwise", () => {
    expect(siteNameFor("/work/handbook")).toBe("handbook");
  });
});

describe("discoverRoot", () => {
  it("never second-guesses an explicit directory", async () => {
    const result = await discoverRoot(".", process.cwd());

    expect(result.ok && result.discovery.reason).toBe("explicit");
  });

  it("says what to do when an explicit directory is not there", async () => {
    const result = await discoverRoot("./definitely-not-here", process.cwd());

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("not a directory");
  });
});

describe("styleFor", () => {
  it("colours a terminal", () => {
    expect(styleFor({ isTty: true, env: {} }).error("x")).not.toBe("x");
  });

  it("stays plain when the output is not a terminal", () => {
    // A pipe, a log file and a CI transcript all want text that greps.
    expect(styleFor({ isTty: false, env: {} }).error("x")).toBe("x");
  });

  it("obeys NO_COLOR over everything", () => {
    expect(styleFor({ isTty: true, env: { NO_COLOR: "1" } }).bold("x")).toBe(
      "x",
    );
  });

  it("obeys FORCE_COLOR when there is no terminal", () => {
    expect(
      styleFor({ isTty: false, env: { FORCE_COLOR: "1" } }).bold("x"),
    ).not.toBe("x");
  });
});

describe("formatForTerminal", () => {
  const plain = styleFor({ isTty: false, env: {} });

  it("says nothing when there is nothing to say", () => {
    expect(formatForTerminal([], plain)).toBe("");
  });

  it("counts by severity before listing", () => {
    const text = formatForTerminal(
      [
        { code: "a/one", severity: "warning", message: "First." },
        { code: "a/two", severity: "warning", message: "Second." },
        { code: "b/one", severity: "error", message: "Third." },
      ],
      plain,
    );

    // One line says how much there is, so a wall of warnings is a choice to
    // read rather than a wall.
    expect(text.split("\n")[0]).toBe("1 error, 2 warnings");
    expect(text).toContain("First.");
    expect(text).toContain("Third.");
  });

  it("uses the singular for one", () => {
    expect(
      formatForTerminal(
        [{ code: "a/one", severity: "warning", message: "Only." }],
        plain,
      ).split("\n")[0],
    ).toBe("1 warning");
  });
});

describe("parseBuildOptions", () => {
  it("normalizes the base path to one leading slash and no trailing one", () => {
    for (const written of ["/repo", "repo", "repo/", "/repo/", "//repo//"]) {
      const parsed = parseBuildOptions(["docs", "--base", written]);
      expect(parsed.ok && parsed.options.basePath, written).toBe("/repo");
    }
  });

  it("reads the --trust declaration", () => {
    const parsed = parseBuildOptions(["docs", "--trust"]);

    expect(parsed.ok && parsed.options.trust).toBe(true);
  });
});

describe("formatSize", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [1048576, "1.0 MB"],
    [1258291, "1.2 MB"],
  ])("formats %d bytes as %s", (bytes, expected) => {
    // No locale formatting: the same project prints the same string on every
    // machine.
    expect(formatSize(bytes)).toBe(expected);
  });
});
