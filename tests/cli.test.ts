import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import {
  readWorkspaceManifests,
  repositoryRoot,
} from "./workspace-manifests.js";

/**
 * End-to-end check of the compiled toolchain.
 *
 * This test deliberately runs the emitted `dist/bin.js` in a child process
 * rather than importing the CLI source. That is what makes it a foundation
 * test: it only passes when the shared TypeScript configuration, the project
 * references, the ESM output, the workspace link from `@tsumugu/cli` to
 * `@tsumugu/core`, and the `bin` entry point all work together.
 */

const binPath = path.join(repositoryRoot, "packages", "cli", "dist", "bin.js");

interface CommandOutcome {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function runCli(args: readonly string[]): Promise<CommandOutcome> {
  return new Promise((resolve, reject) => {
    // process.execPath is used instead of the linked `tsumugu` bin so the test
    // does not depend on PATH or on the shell shims pnpm generates on Windows.
    execFile(process.execPath, [binPath, ...args], (error, stdout, stderr) => {
      if (error === null) {
        resolve({ stdout, stderr, exitCode: 0 });
        return;
      }
      if (typeof error.code === "number") {
        resolve({ stdout, stderr, exitCode: error.code });
        return;
      }
      reject(
        new Error(`could not execute the tsumugu binary at ${binPath}`, {
          cause: error,
        }),
      );
    });
  });
}

let coreVersion: string;

beforeAll(async () => {
  try {
    await access(binPath);
  } catch (cause) {
    throw new Error(
      `${binPath} is missing. Run "pnpm build" before running the tests directly, or use "pnpm test", which builds first.`,
      { cause },
    );
  }

  const manifests = await readWorkspaceManifests();
  const core = manifests.find((manifest) => manifest.name === "@tsumugu/core");
  if (core === undefined) {
    throw new Error("the @tsumugu/core workspace is missing");
  }
  coreVersion = core.version;
});

describe("tsumugu binary", () => {
  it("is emitted with an executable shebang", async () => {
    const bin = await readFile(binPath, "utf8");
    expect(bin.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("reports the core version for --version", async () => {
    const outcome = await runCli(["--version"]);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderr).toBe("");
    // Proves the value crossed the package boundary: it is defined in
    // @tsumugu/core and printed by @tsumugu/cli.
    expect(outcome.stdout).toBe(`tsumugu ${coreVersion}\n`);
  });

  it("accepts the -v alias", async () => {
    const outcome = await runCli(["-v"]);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(`tsumugu ${coreVersion}\n`);
  });

  it("reports usage on stderr and fails when no command is given", async () => {
    const outcome = await runCli([]);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe("");
    expect(outcome.stderr).toContain("Usage: tsumugu --version");
  });

  it("rejects unknown arguments without writing to stdout", async () => {
    const outcome = await runCli(["serve", "--port", "3000"]);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe("");
    expect(outcome.stderr).toContain("Usage: tsumugu --version");
  });

  it("rejects --version combined with other arguments", async () => {
    const outcome = await runCli(["--version", "extra"]);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe("");
  });
});
