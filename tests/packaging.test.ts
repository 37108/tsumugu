import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  readWorkspaceManifests,
  type WorkspaceManifest,
} from "./helpers/workspace-manifests.js";

/**
 * What a consumer would actually receive.
 *
 * A package can pass every other test in this repository and still be broken
 * once published: `files` may omit the build output, a dependency may be
 * declared in the wrong section, or a workspace protocol may survive into the
 * tarball. None of that is visible from inside the workspace, where everything
 * resolves through symlinks.
 *
 * So this packs each package the way a release would and reads the result.
 * Packing is slow — one child process per package — which is why it is one test
 * file at the repository level rather than a check inside each package.
 */

let manifests: readonly WorkspaceManifest[];
let packDirectory: string;

/** Files inside a packed tarball, without the `package/` prefix npm adds. */
const contents = new Map<string, readonly string[]>();

function run(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // On Windows, npm and pnpm are .cmd shims, and Node refuses to spawn a
    // .cmd without a shell. tar is a real executable everywhere.
    const shell = process.platform === "win32";

    execFile(command, [...args], { cwd, shell }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(stdout);
      } else {
        reject(
          new Error(`${command} failed: ${stderr || stdout}`, { cause: error }),
        );
      }
    });
  });
}

beforeAll(async () => {
  manifests = (await readWorkspaceManifests()).filter(
    (manifest) => !manifest.isPrivate,
  );
  packDirectory = await mkdtemp(path.join(tmpdir(), "tsumugu-pack-"));

  for (const manifest of manifests) {
    await run(
      "npm",
      ["pack", "--pack-destination", packDirectory],
      manifest.directory,
    );
  }

  for (const file of await readdir(packDirectory)) {
    const listing = await run("tar", ["-tf", file], packDirectory);
    contents.set(
      file,
      listing
        // Windows tar ends its lines with \r\n, and a stray \r makes every
        // file name compare unequal to itself.
        .split(/\r?\n/u)
        .filter((line) => line.trim() !== "")
        .map((line) => line.replace(/^package\//u, ""))
        .sort(),
    );
  }
}, 120_000);

afterAll(async () => {
  await rm(packDirectory, { recursive: true, force: true });
});

/** The tarball a package produced, found by its name rather than its version. */
function tarballFor(manifest: WorkspaceManifest): readonly string[] {
  const prefix = `${manifest.name.replace("@", "").replace("/", "-")}-`;
  const [, files] =
    [...contents.entries()].find(([file]) => file.startsWith(prefix)) ?? [];

  if (files === undefined) {
    throw new Error(`no tarball was produced for ${manifest.name}`);
  }
  return files;
}

/** Every string reachable inside a manifest field, however it is nested. */
function pathsIn(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.values(value as Record<string, unknown>).flatMap((entry) =>
    pathsIn(entry),
  );
}

describe("published packages", () => {
  it("packs every publishable package", () => {
    expect(manifests.length).toBeGreaterThan(0);
    expect(contents.size).toBe(manifests.length);
  });

  it("ships the build output", () => {
    for (const manifest of manifests) {
      const files = tarballFor(manifest);

      expect(
        files.some((file) => file.startsWith("dist/") && file.endsWith(".js")),
        manifest.name,
      ).toBe(true);
      expect(
        files.some((file) => file.endsWith(".d.ts")),
        manifest.name,
      ).toBe(true);
    }
  });

  it("ships no sources, tests or build state", () => {
    for (const manifest of manifests) {
      const files = tarballFor(manifest);

      for (const file of files) {
        expect(file.startsWith("src/"), `${manifest.name}: ${file}`).toBe(
          false,
        );
        expect(file.endsWith(".test.js"), `${manifest.name}: ${file}`).toBe(
          false,
        );
        expect(file.endsWith(".tsbuildinfo"), `${manifest.name}: ${file}`).toBe(
          false,
        );
      }
    }
  });

  it("ships the manifest, which is what a consumer resolves through", () => {
    for (const manifest of manifests) {
      expect(tarballFor(manifest), manifest.name).toContain("package.json");
    }
  });

  it("declares every entry point it advertises", () => {
    for (const manifest of manifests) {
      const files = tarballFor(manifest);
      const exports = manifest.fields.get("exports");

      // Every path the exports map advertises must exist in the tarball, or
      // the package resolves to nothing the moment it is installed.
      for (const value of pathsIn(exports)) {
        expect(files, `${manifest.name}: ${value}`).toContain(
          value.replace(/^\.\//u, ""),
        );
      }
    }
  });

  it("names a binary that is in the tarball", () => {
    for (const manifest of manifests) {
      const bin = manifest.fields.get("bin");
      if (typeof bin !== "object" || bin === null) {
        continue;
      }

      for (const value of pathsIn(bin)) {
        expect(tarballFor(manifest), `${manifest.name}: ${value}`).toContain(
          value.replace(/^\.\//u, ""),
        );
      }
    }
  });
});
