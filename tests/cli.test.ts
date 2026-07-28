import { execFile, spawn, type ChildProcess } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { repositoryRoot } from "./helpers/paths.js";
import {
  listFiles,
  withTemporaryDirectory,
  writeFiles,
} from "./helpers/temporary-directory.js";
import { readWorkspaceManifests } from "./helpers/workspace-manifests.js";

/**
 * End-to-end check of the compiled toolchain.
 *
 * This test deliberately runs the emitted `dist/bin.js` in a child process
 * rather than importing the CLI source. That is what makes it a foundation
 * test: it only passes when the shared TypeScript configuration, the project
 * references, the ESM output, the workspace link from `tsumugu` to
 * `tsumugu-core`, and the `bin` entry point all work together.
 */

const binPath = path.join(repositoryRoot, "packages", "cli", "dist", "bin.js");

interface CommandOutcome {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function runCli(
  args: readonly string[],
  cwd?: string,
): Promise<CommandOutcome> {
  return new Promise((resolve, reject) => {
    // process.execPath is used instead of the linked `tsumugu` bin so the test
    // does not depend on PATH or on the shell shims pnpm generates on Windows.
    execFile(
      process.execPath,
      [binPath, ...args],
      { ...(cwd === undefined ? {} : { cwd }) },
      (error, stdout, stderr) => {
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
      },
    );
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
  const core = manifests.find((manifest) => manifest.name === "tsumugu-core");
  if (core === undefined) {
    throw new Error("the tsumugu-core workspace is missing");
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
    // tsumugu-core and printed by tsumugu.
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
    expect(outcome.stderr).toContain("tsumugu dev");
  });

  it("rejects unknown arguments without writing to stdout", async () => {
    const outcome = await runCli(["serve", "--port", "3000"]);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe("");
    expect(outcome.stderr).toContain("tsumugu dev");
  });

  it("rejects --version combined with other arguments", async () => {
    const outcome = await runCli(["--version", "extra"]);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe("");
  });

  it("prints help on stdout and succeeds", async () => {
    const outcome = await runCli(["--help"]);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain("tsumugu dev [directory]");
    expect(outcome.stderr).toBe("");
  });

  it("serves a documentation directory and stops on SIGTERM", async () => {
    await withTemporaryDirectory(async (directory) => {
      await writeFiles(directory, { "docs/index.md": "# Served\n" });

      const child = spawn(process.execPath, [binPath, "dev", "--port", "0"], {
        cwd: directory,
      });

      try {
        const startup = await firstOutput(child);

        // The URL is printed only after the port is actually bound, so the
        // address in the terminal is one that already works.
        const url = /http:\/\/127\.0\.0\.1:\d+\//u.exec(startup)?.[0];
        expect(url, startup).toBeDefined();
        expect(startup).toContain("pages  1");

        const response = await fetch(url ?? "");
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("Served");
      } finally {
        const exited = new Promise<number | null>((resolve) => {
          child.once("exit", (code) => resolve(code));
        });
        child.kill("SIGTERM");

        // A clean shutdown, rather than the process being killed, is what
        // releases the port for the next run. Windows has no signals: Node
        // terminates the process outright, so the graceful path — and its
        // exit code — only exists elsewhere.
        expect(await exited).toBe(process.platform === "win32" ? null : 0);
      }
    });
  });

  it("explains a directory that is not there without starting a server", async () => {
    const outcome = await runCli(["dev", "./definitely-not-here"]);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe("");
    expect(outcome.stderr).toContain("not a directory");
  });

  it("builds a site with the same binary that serves one", async () => {
    await withTemporaryDirectory(async (directory) => {
      await writeFiles(directory, {
        "docs/index.md": "# Built\n",
        "docs/guide/setup.md": "# Setup\n",
      });

      const outcome = await runCli(
        ["build", "docs", "--out", "out", "--origin", "https://example.com"],
        directory,
      );

      expect(outcome.exitCode).toBe(0);
      // Two documents plus the generated /search page.
      expect(outcome.stdout).toContain("built 3 pages");

      // Clean URLs on disk, exactly as the issue and the docs promise.
      const written = await listFiles(path.join(directory, "out"));
      expect(written).toContain("index.html");
      expect(written).toContain("guide/setup/index.html");
      expect(written).toContain("sitemap.xml");
    });
  });

  it("refuses to build into a directory it does not own", async () => {
    await withTemporaryDirectory(async (directory) => {
      await writeFiles(directory, {
        "docs/index.md": "# Built\n",
        "out/precious.txt": "not yours",
      });

      const outcome = await runCli(
        ["build", "docs", "--out", "out"],
        directory,
      );

      expect(outcome.exitCode).toBe(2);
      expect(outcome.stderr).toContain("not empty");
    });
  });

  it("says what to do when there is no documentation to find", async () => {
    await withTemporaryDirectory(async (directory) => {
      const outcome = await runCli(["dev"], directory);

      expect(outcome.exitCode).toBe(1);
      expect(outcome.stderr).toContain("No documentation was found");
    });
  });
});

/** The startup output, up to the first newline-terminated chunk. */
function firstOutput(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let seen = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      seen += chunk.toString("utf8");
      if (seen.includes("\n")) {
        resolve(seen);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      reject(
        new Error(`tsumugu dev wrote to stderr: ${chunk.toString("utf8")}`),
      );
    });
    child.once("error", reject);
  });
}
