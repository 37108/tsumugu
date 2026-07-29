import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { repositoryRoot, toPosixPath } from "./helpers/paths.js";
import { readRootManifest } from "./helpers/workspace-manifests.js";

/**
 * Invariants for the workflows.
 *
 * These properties are easy to lose in a hurried edit and expensive to notice
 * afterwards: a moved action tag, a widened permission, a `pnpm install` that
 * quietly resolves new versions, or a step calling a script that no longer
 * exists. Each is checked here rather than left to review attention.
 *
 * The files are matched as text rather than parsed as YAML. Every rule below is
 * a property of a single line, so a parser would add a dependency without
 * making any assertion more precise.
 */

const workflowsDirectory = path.join(repositoryRoot, ".github", "workflows");

interface Workflow {
  readonly name: string;
  readonly text: string;
}

let workflows: readonly Workflow[];
let rootScripts: ReadonlySet<string>;

/**
 * The release workflow is the exception to several rules below.
 *
 * It is the one workflow that writes: it opens the version pull request and
 * publishes to a registry, so it needs a token and write permissions that
 * every other workflow must not have. The exception is named here, once, so
 * that widening a rule for it cannot quietly widen it for the rest.
 */
const releaseWorkflow = ".github/workflows/release.yml";

function isRelease(workflow: Workflow): boolean {
  return workflow.name === releaseWorkflow;
}

/**
 * The Pages workflow is the other exception: deploying needs `pages: write`
 * and the id-token, it runs only on the default branch, and superseding an
 * in-flight deployment is safe — the opposite of a package publish.
 */
const pagesWorkflow = ".github/workflows/pages.yml";

function isPages(workflow: Workflow): boolean {
  return workflow.name === pagesWorkflow;
}

beforeAll(async () => {
  const entries = await readdir(workflowsDirectory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  workflows = await Promise.all(
    files.map(async (name) => ({
      name: toPosixPath(path.join(".github", "workflows", name)),
      text: await readFile(path.join(workflowsDirectory, name), "utf8"),
    })),
  );

  const manifest = await readRootManifest();
  const scripts = manifest["scripts"];
  rootScripts = new Set(
    typeof scripts === "object" && scripts !== null ? Object.keys(scripts) : [],
  );
});

describe("workflow discovery", () => {
  it("finds at least one workflow", () => {
    expect(workflows.map((workflow) => workflow.name)).toContain(
      ".github/workflows/ci.yml",
    );
  });
});

describe("supply chain", () => {
  it("pins every third-party action to an immutable commit", () => {
    for (const workflow of workflows) {
      const uses = [...workflow.text.matchAll(/uses:\s*(\S+)/g)].map(
        (match) => match[1] ?? "",
      );
      expect(uses.length).toBeGreaterThan(0);

      for (const reference of uses) {
        // Local composite actions are part of this repository and need no pin.
        if (reference.startsWith("./")) {
          continue;
        }
        expect(
          reference,
          `${workflow.name} must pin ${reference} to a full commit SHA; a tag can be moved to point at different code`,
        ).toMatch(/@[0-9a-f]{40}$/);
      }
    }
  });

  it("installs dependencies from the lockfile without modifying it", () => {
    for (const workflow of workflows) {
      const installs = workflow.text
        .split("\n")
        .filter((line) => /\bpnpm install\b/.test(line));
      expect(installs.length).toBeGreaterThan(0);

      for (const line of installs) {
        expect(
          line,
          `${workflow.name} must install with --frozen-lockfile, otherwise CI tests versions the lockfile does not describe`,
        ).toContain("--frozen-lockfile");
      }
    }
  });

  it("requires no repository secret outside the release workflow", () => {
    for (const workflow of workflows.filter((entry) => !isRelease(entry))) {
      // A workflow that reads a secret cannot run for pull requests from forks.
      expect(
        workflow.text,
        `${workflow.name} must not reference secrets`,
      ).not.toMatch(/secrets\./);
    }
  });

  it("publishes with a short-lived credential rather than a stored token", () => {
    const release = workflows.find(isRelease);
    expect(release).toBeDefined();

    // `id-token: write` is what lets npm trusted publishing mint a credential
    // for this run. A long-lived NPM_TOKEN in repository secrets would be a
    // credential that leaks once and works forever.
    expect(release?.text).toMatch(/id-token:\s*write/);
    expect(release?.text).not.toMatch(/secrets\.NPM_TOKEN/);
  });
});

describe("permissions", () => {
  it("declares least-privilege permissions", () => {
    for (const workflow of workflows) {
      expect(
        workflow.text,
        `${workflow.name} must declare an explicit permissions block`,
      ).toMatch(/^permissions:/m);

      const granted = [
        ...workflow.text.matchAll(/^\s+(\w+):\s*(read|write)$/gm),
      ];
      expect(granted.length).toBeGreaterThan(0);

      // The writing workflows are exceptions, and what each may write is
      // stated exactly.
      const allowedToWrite = isRelease(workflow)
        ? new Set(["contents", "pull-requests", "id-token"])
        : isPages(workflow)
          ? new Set(["pages", "id-token"])
          : new Set<string>();

      for (const [line, scope, level] of granted) {
        if (level === "write" && allowedToWrite.has(scope ?? "")) {
          continue;
        }
        expect(
          level,
          `${workflow.name} grants ${scope ?? "?"}: write ("${line.trim()}"); nothing here writes to the repository`,
        ).toBe("read");
      }
    }
  });
});

describe("triggers", () => {
  it("runs on pull requests and on pushes to the default branch", () => {
    for (const workflow of workflows.filter(
      (entry) => !isRelease(entry) && !isPages(entry),
    )) {
      expect(workflow.text).toMatch(/^\s*pull_request:/m);
      expect(workflow.text).toMatch(/^\s*push:/m);
      expect(workflow.text).toMatch(/branches:\s*\[main\]/);
    }
  });

  it("releases only from the default branch, never from a pull request", () => {
    for (const workflow of workflows.filter(
      (entry) => isRelease(entry) || isPages(entry),
    )) {
      // A deployment triggered by opening a pull request would publish a
      // branch.
      expect(workflow.text).not.toMatch(/^\s*pull_request:/m);
      expect(workflow.text).toMatch(/branches:\s*\[main\]/);
    }
  });

  it("never cancels a release that may already be publishing", () => {
    const release = workflows.find(isRelease);

    expect(release?.text).toMatch(/concurrency:/);
    // Cancelling mid-publish would leave some packages released and some not.
    expect(release?.text).toContain("cancel-in-progress: false");
  });

  it("cancels runs that a newer commit has superseded", () => {
    for (const workflow of workflows.filter((entry) => !isRelease(entry))) {
      expect(workflow.text).toMatch(/^concurrency:/m);
      expect(workflow.text).toContain("cancel-in-progress: true");
    }
  });
});

describe("commands", () => {
  it("only runs scripts that the root manifest defines", () => {
    expect(rootScripts.size).toBeGreaterThan(0);

    for (const workflow of workflows) {
      const referenced = [...workflow.text.matchAll(/pnpm run ([\w:-]+)/g)].map(
        (match) => match[1] ?? "",
      );
      expect(referenced.length).toBeGreaterThan(0);

      for (const script of referenced) {
        expect(
          rootScripts.has(script),
          `${workflow.name} runs "pnpm run ${script}", which the root package.json does not define`,
        ).toBe(true);
      }
    }
  });

  it("covers every local quality gate", () => {
    const combined = workflows.map((workflow) => workflow.text).join("\n");

    // CI must not be weaker than the gate contributors run locally.
    for (const script of [
      "format:check",
      "lint",
      "typecheck",
      "build",
      "test",
    ]) {
      expect(combined, `no workflow runs "pnpm run ${script}"`).toContain(
        `pnpm run ${script}`,
      );
    }
  });
});

describe("step order", () => {
  it("builds before linting", () => {
    // Type-aware linting resolves a package's imports through the declarations
    // its dependencies emit. Linting first fails with "a type that cannot be
    // resolved" for every cross-package import - and it fails only in CI,
    // because a developer's dist/ is usually already there from a previous run.
    for (const workflow of workflows) {
      const build = workflow.text.indexOf("pnpm run build");
      const lint = workflow.text.indexOf("pnpm run lint");
      if (build === -1 || lint === -1) {
        continue;
      }
      expect(
        build,
        `${workflow.name} lints before it builds; cross-package types will not resolve`,
      ).toBeLessThan(lint);
    }
  });
});

describe("the published documentation", () => {
  it("builds the site with the declaration its own pages need", () => {
    // Two architecture pages compute their figures while the page is built
    // (ADR 7). Without --trust the deployment still succeeds and the figures
    // silently become source, which is the kind of failure nobody notices
    // until a reader does.
    const pages = workflows.find((workflow) => workflow.name === pagesWorkflow);
    expect(pages, "the Pages workflow is missing").toBeDefined();

    const build = /bin\.js build docs[^\n]*(?:\n\s{10}[^\n]*)*/u.exec(
      pages?.text ?? "",
    )?.[0];
    expect(build, "the Pages workflow does not build the site").toBeDefined();
    expect(build).toContain("--trust");
  });
});
