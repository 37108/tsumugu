import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { repositoryRoot, toPosixPath } from "./paths.js";

/**
 * Directories that contain workspaces, matching the globs in
 * `pnpm-workspace.yaml`.
 */
export const workspaceRoots = ["internal", "packages"] as const;

export type WorkspaceRoot = (typeof workspaceRoots)[number];

export interface WorkspaceManifest {
  /** Repository-relative location using POSIX separators, e.g. `packages/core`. */
  readonly id: string;
  readonly root: WorkspaceRoot;
  /** Absolute path to the workspace directory. */
  readonly directory: string;
  readonly name: string;
  readonly version: string;
  readonly isPrivate: boolean;
  readonly dependencies: ReadonlyMap<string, string>;
  readonly devDependencies: ReadonlyMap<string, string>;
  /** Top-level manifest fields, for presence checks that need no parsing. */
  readonly fields: ReadonlyMap<string, unknown>;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonObject(file: string): Promise<Record<string, unknown>> {
  const text = await readFile(file, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`${file} is not valid JSON`, { cause });
  }

  if (!isJsonObject(parsed)) {
    throw new Error(`${file} must contain a JSON object`);
  }
  return parsed;
}

function requireString(
  manifest: Record<string, unknown>,
  key: string,
  file: string,
): string {
  const value = manifest[key];
  if (typeof value !== "string") {
    throw new Error(`${file} must declare a string "${key}" field`);
  }
  return value;
}

function readDependencies(
  manifest: Record<string, unknown>,
  key: string,
  file: string,
): ReadonlyMap<string, string> {
  const value = manifest[key];
  if (value === undefined) {
    return new Map();
  }
  if (!isJsonObject(value)) {
    throw new Error(`${file} field "${key}" must be an object`);
  }

  const entries = new Map<string, string>();
  for (const [dependency, range] of Object.entries(value)) {
    if (typeof range !== "string") {
      throw new Error(
        `${file} field "${key}.${dependency}" must be a version range string`,
      );
    }
    entries.set(dependency, range);
  }
  return entries;
}

async function readWorkspaceDirectory(
  root: WorkspaceRoot,
): Promise<WorkspaceManifest[]> {
  const rootDirectory = path.join(repositoryRoot, root);
  const entries = await readdir(rootDirectory, { withFileTypes: true });

  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    // Sorted so that discovery order, and therefore failure output, is
    // identical on every platform.
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const manifests: WorkspaceManifest[] = [];
  for (const directoryName of directories) {
    const directory = path.join(rootDirectory, directoryName);
    const file = path.join(directory, "package.json");
    const manifest = await readJsonObject(file);

    manifests.push({
      id: toPosixPath(path.relative(repositoryRoot, directory)),
      root,
      directory,
      name: requireString(manifest, "name", file),
      version: requireString(manifest, "version", file),
      isPrivate: manifest["private"] === true,
      dependencies: readDependencies(manifest, "dependencies", file),
      devDependencies: readDependencies(manifest, "devDependencies", file),
      fields: new Map(Object.entries(manifest)),
    });
  }
  return manifests;
}

/**
 * Reads every workspace manifest in the repository, ordered deterministically
 * by workspace identifier.
 */
export async function readWorkspaceManifests(): Promise<WorkspaceManifest[]> {
  const perRoot = await Promise.all(workspaceRoots.map(readWorkspaceDirectory));
  return perRoot
    .flat()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Reads the repository root manifest. */
export async function readRootManifest(): Promise<Record<string, unknown>> {
  return readJsonObject(path.join(repositoryRoot, "package.json"));
}

/**
 * Returns the first workspace dependency cycle found, as a list of workspace
 * names ending with the name that closes the cycle, or `undefined` when the
 * graph is acyclic.
 */
export function findDependencyCycle(
  manifests: readonly WorkspaceManifest[],
): readonly string[] | undefined {
  const workspaceNames = new Set(manifests.map((manifest) => manifest.name));
  const edges = new Map<string, readonly string[]>(
    manifests.map((manifest) => [
      manifest.name,
      [...manifest.dependencies.keys(), ...manifest.devDependencies.keys()]
        .filter((dependency) => workspaceNames.has(dependency))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    ]),
  );

  const settled = new Set<string>();
  const stack: string[] = [];

  const visit = (name: string): readonly string[] | undefined => {
    const cycleStart = stack.indexOf(name);
    if (cycleStart !== -1) {
      return [...stack.slice(cycleStart), name];
    }
    if (settled.has(name)) {
      return undefined;
    }

    stack.push(name);
    for (const dependency of edges.get(name) ?? []) {
      const cycle = visit(dependency);
      if (cycle !== undefined) {
        return cycle;
      }
    }
    stack.pop();
    settled.add(name);
    return undefined;
  };

  for (const manifest of manifests) {
    const cycle = visit(manifest.name);
    if (cycle !== undefined) {
      return cycle;
    }
  }
  return undefined;
}
