import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { listSourceFiles, readImportReferences } from "./helpers/imports.js";
import { repositoryRoot, toPosixPath } from "./helpers/paths.js";
import {
  readWorkspaceManifests,
  type WorkspaceManifest,
} from "./helpers/workspace-manifests.js";

/**
 * Import-level enforcement of the dependency rules in
 * `docs/designs/architecture/workspaces.md`.
 *
 * `tests/workspace.test.ts` checks the package manifests. That catches a
 * declared edge, but not an import that bypasses the declaration: a deep import
 * into another package's source tree, or a module that resolves only because
 * pnpm happened to hoist it. Those work locally and break for consumers, which
 * makes them exactly the kind of mistake worth catching before it is published.
 *
 * The rules are written out explicitly rather than configured into a
 * general-purpose dependency framework. There are six of them; a short list of
 * conditions is easier to audit than a rule engine, and every violation can
 * carry a message naming the source, the target, and the rule it broke.
 */

/** Packages `tsumugu-core` must never reach for, in any form. */
const forbiddenFromCore: readonly {
  readonly pattern: RegExp;
  readonly reason: string;
}[] = [
  {
    pattern: /^tsumugu$/,
    reason: "the CLI composes core, not the reverse",
  },
  { pattern: /^tsumugu-theme-/, reason: "themes consume core contracts" },
  {
    pattern: /^tsumugu-renderer-/,
    reason: "renderers register into core rather than being part of it",
  },
  {
    pattern: /^tsumugu-transformer-/,
    reason: "transformers register into core rather than being part of it",
  },
  {
    pattern: /^tsumugu-build$/,
    reason: "the build adapter consumes pipeline output",
  },
  { pattern: /^tsumugu-search$/, reason: "search is a higher-level package" },
  { pattern: /^tsumugu-ai$/, reason: "AI export is a higher-level package" },
];

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly message: string;
}

function describeViolations(violations: readonly Violation[]): string[] {
  return violations.map(
    (violation) =>
      `${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`,
  );
}

/** Splits `tsumugu-core/sub/path` into its package name and subpath. */
function splitSpecifier(specifier: string): {
  readonly packageName: string;
  readonly subpath: string;
} {
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    return {
      packageName: segments.slice(0, 2).join("/"),
      subpath: segments.slice(2).join("/"),
    };
  }
  return {
    packageName: segments[0] ?? specifier,
    subpath: segments.slice(1).join("/"),
  };
}

let manifests: readonly WorkspaceManifest[];
let violations: readonly Violation[];

beforeAll(async () => {
  manifests = await readWorkspaceManifests();

  const byName = new Map(
    manifests.map((manifest) => [manifest.name, manifest]),
  );
  const found: Violation[] = [];

  for (const manifest of manifests) {
    let sources: string[];
    try {
      sources = await listSourceFiles(manifest.directory);
    } catch {
      // A workspace with no src/ directory, such as the shared tsconfig.
      continue;
    }

    for (const file of sources) {
      const relativeFile = toPosixPath(path.relative(repositoryRoot, file));
      const references = await readImportReferences(file);

      for (const { specifier, line } of references) {
        const at = { file: relativeFile, line };

        if (specifier.startsWith(".")) {
          // A relative import must stay inside the package that owns the file.
          const resolved = path.resolve(path.dirname(file), specifier);
          const escape = path.relative(manifest.directory, resolved);
          if (escape.startsWith("..")) {
            found.push({
              ...at,
              rule: "escaping-relative-import",
              message: `${manifest.name} reaches outside its own directory with "${specifier}". Cross-package access must go through the package name so the dependency is declared and resolvable after publication.`,
            });
          }
          continue;
        }

        const { packageName, subpath } = splitSpecifier(specifier);
        const target = byName.get(packageName);
        if (target === undefined) {
          // A third-party or Node.js built-in module. Whether it is allowed to
          // be a dependency at all is the dependency policy in CONTRIBUTING.md,
          // not a workspace boundary.
          continue;
        }

        if (subpath !== "") {
          const exports = target.fields.get("exports");
          const exposed =
            typeof exports === "object" &&
            exports !== null &&
            Object.hasOwn(exports, `./${subpath}`);
          if (!exposed) {
            found.push({
              ...at,
              rule: "deep-import",
              message: `${manifest.name} imports "${specifier}", reaching into ${packageName}'s private source tree. Only paths listed in that package's "exports" map exist after publication.`,
            });
            continue;
          }
        }

        if (manifest.root === "packages" && target.root === "internal") {
          found.push({
            ...at,
            rule: "internal-dependency",
            message: `${manifest.name} imports the internal workspace ${packageName}, which is never published. A consumer installing ${manifest.name} would not receive it.`,
          });
        }

        if (manifest.name === "tsumugu-core") {
          for (const { pattern, reason } of forbiddenFromCore) {
            if (pattern.test(packageName)) {
              found.push({
                ...at,
                rule: "forbidden-edge",
                message: `tsumugu-core imports ${packageName}: ${reason}.`,
              });
            }
          }
        }

        const declared =
          manifest.dependencies.has(packageName) ||
          manifest.devDependencies.has(packageName);
        if (!declared) {
          found.push({
            ...at,
            rule: "undeclared-dependency",
            message: `${manifest.name} imports ${packageName} without declaring it. The import resolves today only because the workspace is installed alongside it, and would fail for a consumer.`,
          });
        }
      }
    }
  }

  violations = found;
});

describe("import boundaries", () => {
  it("scans the sources it is supposed to scan", async () => {
    // Without this, a broken discovery step would report zero violations and
    // look like a pass.
    const core = manifests.find((entry) => entry.name === "tsumugu-core");
    expect(core).toBeDefined();
    if (core === undefined) {
      return;
    }
    expect((await listSourceFiles(core.directory)).length).toBeGreaterThan(0);
  });

  it("has no violations of any rule", () => {
    expect(describeViolations(violations)).toEqual([]);
  });

  it.each([
    "escaping-relative-import",
    "deep-import",
    "internal-dependency",
    "forbidden-edge",
    "undeclared-dependency",
  ])("has no %s violations", (rule) => {
    // Reported per rule as well as in aggregate, so a failure names the rule
    // that broke rather than only that something did.
    expect(
      describeViolations(violations.filter((entry) => entry.rule === rule)),
    ).toEqual([]);
  });
});

describe("public export surface", () => {
  /**
   * The runtime exports each publishable package is allowed to expose.
   *
   * Adding a name here is a deliberate act. `docs/designs/principles.md` treats a
   * public API as something earned through real usage, and an export added for
   * convenience becomes a compatibility commitment the moment it is published.
   */
  const expectedExports: Readonly<Record<string, readonly string[]>> = {
    // Core's surface stayed types-only until a theme and an entry point
    // existed outside it. A theme cannot be written without the Virtual Tree
    // builders, and an entry point cannot compose a pipeline it cannot call —
    // so each of these was added because something real could not exist
    // otherwise, which is what "earned" means in docs/designs/principles.md.
    "tsumugu-core": [
      "buildSite",
      "createHeadingIdTransformer",
      "createReloadChannel",
      "createSite",
      "element",
      "formatDiagnostic",
      "formatDiagnostics",
      "fragment",
      "reloadPath",
      "reloadScript",
      "renderUnsupported",
      "renderWithTheme",
      "runTransformers",
      "serializeToHtml",
      "serve",
      "summarizeDiagnostics",
      "text",
      "trustedHtml",
      "version",
      "watchRoot",
    ],
    "tsumugu-build": ["buildCodes", "buildStatic", "fileForRoute"],
    tsumugu: [
      "describeBuild",
      "describeStartup",
      "describeUpdate",
      "describeUpdateFailure",
      "discoverRoot",
      "exitCodes",
      "formatForTerminal",
      "formatSize",
      "parseBuildOptions",
      "parseDevOptions",
      "run",
      "runBuild",
      "siteNameFor",
      "startDev",
      "styleFor",
      "usage",
    ],
    "tsumugu-renderer-markdown": ["createMarkdownRenderer", "markdownCodes"],
    "tsumugu-renderer-mdx": ["createMdxRenderer", "mdxCodes"],
    "tsumugu-renderer-html": ["createHtmlRenderer", "isFullDocument"],
    "tsumugu-preset": ["createPreset", "officialComposition"],
    "tsumugu-theme-default": ["defaultTheme", "defaultThemeStylesheet"],
    "tsumugu-transformer-highlight": [
      "createHighlightTransformer",
      "highlightCodes",
      "highlightTransformerId",
      "resolveLanguage",
    ],
  };

  /**
   * Names a module exposes at runtime, imported by package name so that this
   * also proves the "exports" map resolves the way a consumer's would.
   */
  async function readModuleExports(specifier: string): Promise<string[]> {
    // A dynamic import with a computed specifier is typed `any`, so the result
    // is narrowed before anything is read from it.
    const imported: unknown = await import(specifier);
    if (typeof imported !== "object" || imported === null) {
      throw new Error(`${specifier} did not resolve to a module namespace`);
    }
    return Object.keys(imported).sort();
  }

  it.each(Object.entries(expectedExports))(
    "%s exposes exactly its declared surface",
    async (packageName, expected) => {
      await expect(readModuleExports(packageName)).resolves.toEqual(
        [...expected].sort(),
      );
    },
  );

  it("covers every publishable package", () => {
    const publishable = manifests
      .filter((manifest) => manifest.root === "packages")
      .map((manifest) => manifest.name)
      .sort();

    // A new package must be given an expected surface rather than silently
    // escaping this check.
    expect(publishable).toEqual(Object.keys(expectedExports).sort());
  });
});
