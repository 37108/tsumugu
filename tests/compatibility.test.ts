import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import {
  readRootManifest,
  readWorkspaceManifests,
  repositoryRoot,
  type WorkspaceManifest,
} from "./workspace-manifests.js";

/**
 * Enforcement for the compatibility policy in `docs/compatibility.md`.
 *
 * A policy that only exists in prose drifts away from the manifests it
 * describes. These constants are the single place the policy is written down in
 * executable form; the tests below assert that the manifests and the document
 * both agree with them.
 */

/** Minimum supported Node.js version, as declared in `engines.node`. */
const nodeEngineRange = ">=24.0.0";

/** The pinned package manager must name an exact pnpm version, never a range. */
const pinnedPackageManagerPattern = /^pnpm@\d+\.\d+\.\d+$/;

/**
 * Export conditions that would expose a CommonJS entry point. The repository is
 * ESM-only, so none of these may appear.
 */
const commonJsExportConditions = new Set(["require", "node-addons"]);

/** Manifest fields that declare a CommonJS entry point. */
const commonJsManifestFields = ["main"];

function findCommonJsConditions(value: unknown, trail: string): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }

  const found: string[] = [];
  for (const [key, nested] of Object.entries(value)) {
    const location = `${trail}.${key}`;
    if (commonJsExportConditions.has(key)) {
      found.push(location);
    }
    found.push(...findCommonJsConditions(nested, location));
  }
  return found;
}

let manifests: readonly WorkspaceManifest[];
let publishableIntent: readonly WorkspaceManifest[];
let rootManifest: Record<string, unknown>;

beforeAll(async () => {
  manifests = await readWorkspaceManifests();
  publishableIntent = manifests.filter(
    (manifest) => manifest.root === "packages",
  );
  rootManifest = await readRootManifest();
});

describe("Node.js baseline", () => {
  it("declares the documented minimum at the repository root", () => {
    const engines = rootManifest["engines"];
    expect(engines).toEqual({ node: nodeEngineRange });
  });

  it("declares the same minimum in every publishable package", () => {
    expect(publishableIntent.length).toBeGreaterThan(0);

    for (const manifest of publishableIntent) {
      expect(
        manifest.fields.get("engines"),
        `${manifest.id} must declare the documented Node.js range`,
      ).toEqual({ node: nodeEngineRange });
    }
  });

  it("enforces the range at install time rather than only documenting it", async () => {
    const config = await readFile(
      path.join(repositoryRoot, "pnpm-workspace.yaml"),
      "utf8",
    );
    const settings = config
      .split("\n")
      .map((line) => line.replace(/#.*$/, "").trim())
      .filter((line) => line !== "");

    // Without this, engines.node is advisory and an unsupported runtime fails
    // later with an unrelated error instead of at install time.
    expect(settings).toContain("engineStrict: true");
  });
});

describe("package manager", () => {
  it("pins an exact pnpm version", () => {
    const packageManager = rootManifest["packageManager"];
    expect(typeof packageManager).toBe("string");
    expect(packageManager).toMatch(pinnedPackageManagerPattern);
  });
});

describe("module format", () => {
  it("declares every workspace as ESM", () => {
    for (const manifest of manifests) {
      expect(
        manifest.fields.get("type"),
        `${manifest.id} must declare "type": "module"`,
      ).toBe("module");
    }
    expect(rootManifest["type"]).toBe("module");
  });

  it("exposes no CommonJS entry point", () => {
    for (const manifest of manifests) {
      for (const field of commonJsManifestFields) {
        expect(
          manifest.fields.has(field),
          `${manifest.id} must not declare "${field}"; the repository is ESM-only`,
        ).toBe(false);
      }

      const conditions = findCommonJsConditions(
        manifest.fields.get("exports"),
        "exports",
      );
      expect(
        conditions,
        `${manifest.id} must not expose CommonJS export conditions`,
      ).toEqual([]);
    }
  });
});

describe("documentation", () => {
  let policy: string;

  beforeAll(async () => {
    policy = await readFile(
      path.join(repositoryRoot, "docs", "compatibility.md"),
      "utf8",
    );
  });

  it("documents the minimum Node.js version that the manifests declare", () => {
    // nodeEngineRange is ">=24.0.0"; the document states the bare version.
    const minimum = nodeEngineRange.replace(/^[^\d]*/, "");
    expect(policy).toContain(minimum);
  });

  it("documents the pinned package manager version", () => {
    const packageManager = rootManifest["packageManager"];
    expect(typeof packageManager).toBe("string");
    if (typeof packageManager !== "string") {
      return;
    }
    const version = packageManager.replace(/^pnpm@/, "");
    expect(policy).toContain(version);
  });

  it("states the position on unsupported runtimes without hedging", () => {
    for (const runtime of ["Bun", "Deno"]) {
      expect(policy).toContain(runtime);
    }
    expect(policy).toContain("not supported");
  });
});
