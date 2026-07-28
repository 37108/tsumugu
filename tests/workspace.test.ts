import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { repositoryRoot, toPosixPath } from "./helpers/paths.js";
import {
  findDependencyCycle,
  readRootManifest,
  readWorkspaceManifests,
  workspaceRoots,
  type WorkspaceManifest,
} from "./helpers/workspace-manifests.js";

/**
 * Architectural invariants of the workspace graph.
 *
 * These are checked against the package manifests, which is the level at which
 * a mistake becomes permanent: a published dependency edge cannot be taken back
 * once consumers exist. Import-level enforcement inside source files is tracked
 * separately in issue #6.
 */

/**
 * Package name patterns `@tsumugu/core` must never depend on, taken from
 * `docs/architecture/overview.md`: dependencies point towards core, never away
 * from it.
 */
const forbiddenCoreDependencies: readonly {
  readonly pattern: RegExp;
  readonly reason: string;
}[] = [
  {
    pattern: /^@tsumugu\/cli$/,
    reason: "the CLI composes core, not the reverse",
  },
  { pattern: /^@tsumugu\/theme-/, reason: "themes consume core contracts" },
  {
    pattern: /^@tsumugu\/renderer-/,
    reason: "renderers are format-specific and register into core",
  },
  {
    pattern: /^@tsumugu\/build$/,
    reason: "the build adapter is a consumer of pipeline output",
  },
  { pattern: /^@tsumugu\/search$/, reason: "search is a higher-level package" },
  { pattern: /^@tsumugu\/ai$/, reason: "AI export is a higher-level package" },
];

let manifests: readonly WorkspaceManifest[];
let publishableIntent: readonly WorkspaceManifest[];
let internalWorkspaces: readonly WorkspaceManifest[];

beforeAll(async () => {
  manifests = await readWorkspaceManifests();
  publishableIntent = manifests.filter(
    (manifest) => manifest.root === "packages",
  );
  internalWorkspaces = manifests.filter(
    (manifest) => manifest.root === "internal",
  );
});

describe("workspace discovery", () => {
  it("finds the expected workspaces in a deterministic order", () => {
    expect(manifests.map((manifest) => manifest.id)).toEqual([
      "internal/tsconfig",
      "packages/cli",
      "packages/core",
      "packages/renderer-html",
      "packages/renderer-markdown",
      "packages/theme-default",
      "packages/transformer-highlight",
    ]);
  });

  it("declares every workspace root in pnpm-workspace.yaml", async () => {
    const config = await readFile(
      path.join(repositoryRoot, "pnpm-workspace.yaml"),
      "utf8",
    );
    const globs = config
      .split("\n")
      .map((line) => line.replace(/#.*$/, "").trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim());

    expect(globs).toEqual(
      expect.arrayContaining(workspaceRoots.map((root) => `${root}/*`)),
    );
  });

  it("reports workspace identifiers with POSIX separators", () => {
    // Windows would otherwise produce `packages\core` here, which would make
    // every identifier assertion in this file platform-specific.
    for (const manifest of manifests) {
      expect(manifest.id).toBe(toPosixPath(manifest.id));
      expect(manifest.id).not.toContain("\\");
    }
  });
});

describe("publication safety", () => {
  it("keeps the repository root private", async () => {
    const root = await readRootManifest();
    expect(root["private"]).toBe(true);
  });

  it("keeps every workspace private during pre-alpha", () => {
    const publishable = manifests
      .filter((manifest) => !manifest.isPrivate)
      .map((manifest) => manifest.id);

    // Nothing is published yet. Release configuration is tracked in issue #49.
    expect(publishable).toEqual([]);
  });

  it("names internal workspaces so they are recognisable as internal", () => {
    expect(internalWorkspaces.length).toBeGreaterThan(0);

    for (const manifest of internalWorkspaces) {
      expect(
        manifest.name,
        `${manifest.id} must use the @tsumugu/internal- prefix`,
      ).toMatch(/^@tsumugu\/internal-/);
      expect(manifest.isPrivate, `${manifest.id} must never be published`).toBe(
        true,
      );
    }
  });

  it("does not let a publishable package require an internal workspace at runtime", () => {
    const internalNames = new Set(
      internalWorkspaces.map((manifest) => manifest.name),
    );

    for (const manifest of publishableIntent) {
      const leaked = [...manifest.dependencies.keys()].filter((dependency) =>
        internalNames.has(dependency),
      );
      expect(
        leaked,
        `${manifest.id} lists internal workspaces in "dependencies"; internal workspaces are never published, so they may only appear in "devDependencies"`,
      ).toEqual([]);
    }
  });
});

describe("package metadata", () => {
  it("declares an explicit public surface for every publishable package", () => {
    expect(publishableIntent.length).toBeGreaterThan(0);

    for (const manifest of publishableIntent) {
      for (const field of [
        "exports",
        "files",
        "license",
        "repository",
        "engines",
      ]) {
        expect(
          manifest.fields.has(field),
          `${manifest.id} must declare "${field}"`,
        ).toBe(true);
      }
      expect(
        manifest.fields.get("type"),
        `${manifest.id} must be ESM-only`,
      ).toBe("module");
    }
  });

  it("resolves workspace dependencies through the workspace protocol", () => {
    const workspaceNames = new Set(manifests.map((manifest) => manifest.name));

    for (const manifest of manifests) {
      const entries = [
        ...manifest.dependencies.entries(),
        ...manifest.devDependencies.entries(),
      ];
      for (const [dependency, range] of entries) {
        if (!workspaceNames.has(dependency)) {
          continue;
        }
        expect(
          range,
          `${manifest.id} must depend on ${dependency} through the workspace protocol`,
        ).toMatch(/^workspace:/);
      }
    }
  });
});

describe("dependency direction", () => {
  it("contains no workspace dependency cycles", () => {
    const cycle = findDependencyCycle(manifests);
    expect(
      cycle === undefined ? undefined : cycle.join(" -> "),
      "workspace dependency cycles are forbidden",
    ).toBeUndefined();
  });

  it("keeps core free of dependencies on higher-level packages", () => {
    const core = manifests.find(
      (manifest) => manifest.name === "@tsumugu/core",
    );
    expect(core, "@tsumugu/core workspace is missing").toBeDefined();
    if (core === undefined) {
      return;
    }

    const declared = [
      ...core.dependencies.keys(),
      ...core.devDependencies.keys(),
    ];
    for (const { pattern, reason } of forbiddenCoreDependencies) {
      const violations = declared.filter((dependency) =>
        pattern.test(dependency),
      );
      expect(
        violations,
        `@tsumugu/core must not depend on ${pattern.source}: ${reason}`,
      ).toEqual([]);
    }
  });
});
