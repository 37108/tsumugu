import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

import type { DocumentDiagnostic } from "../document/diagnostics.js";
import {
  discoverDocument,
  documentCodes,
  type DiscoveredDocument,
} from "../document/document.js";
import { toSnapshot, type DocumentSnapshot } from "./events.js";

/**
 * File discovery.
 *
 * The scanner is the first active stage in the pipeline, so its behaviour is
 * inherited by routing, caching, live reload and incremental rendering. It
 * discovers files and reports problems as values; it does not decide what a
 * document means, where it is served, or how it is rendered.
 */

export interface ScanOptions {
  /** Absolute path to the documentation root. */
  readonly root: string;
  /**
   * Extra directory or file names to skip, in addition to the defaults.
   *
   * Matched against a single path segment, not a glob. A glob language is a
   * feature to design, not a default to slip in.
   */
  readonly ignore?: readonly string[];
}

export interface ScanResult {
  readonly snapshot: DocumentSnapshot;
  /**
   * Problems found while scanning. A scan always completes: one unreadable
   * directory must not cost the user every other page.
   */
  readonly diagnostics: readonly DocumentDiagnostic[];
}

export const scannerCodes = {
  unreadable: "scanner/unreadable",
  symlinkSkipped: "scanner/symlink-skipped",
  rootUnreadable: "scanner/root-unreadable",
} as const;

/**
 * Directory names never descended into.
 *
 * `node_modules` because it is not documentation and is enormous. Hidden
 * entries — anything beginning with `.` — because they are tool state:
 * `.git`, `.obsidian`, `.vscode`. A user who genuinely wants a hidden
 * directory scanned is asking for something worth designing explicitly.
 */
const ignoredDirectories = new Set(["node_modules"]);

/**
 * File names that are editor droppings rather than documents.
 *
 * Vim swap files, Emacs backups and lock files, and the metadata files macOS
 * and Windows leave in directories. Without this, opening a file in an editor
 * would produce spurious added and removed events while it is being edited.
 */
function isEditorArtifact(name: string): boolean {
  return (
    name.endsWith("~") ||
    /\.sw[a-p]$/.test(name) ||
    /^\.#/.test(name) ||
    /^#.*#$/.test(name) ||
    name === ".DS_Store" ||
    name === "Thumbs.db"
  );
}

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

function isIgnored(name: string, extra: ReadonlySet<string>): boolean {
  return (
    extra.has(name) ||
    isHidden(name) ||
    ignoredDirectories.has(name) ||
    isEditorArtifact(name)
  );
}

function errorCode(cause: unknown): string | undefined {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) {
    return undefined;
  }
  const { code } = cause;
  return typeof code === "string" ? code : undefined;
}

/**
 * Discovers every supported document under `root`.
 *
 * Directories are read in sorted order, so the snapshot and every diff derived
 * from it are identical run to run and platform to platform. Without that,
 * event order would follow whatever order the file system happened to return.
 *
 * **Symlinks are not followed.** A symlink can point outside the documentation
 * root, and following one would serve content from a place the user did not put
 * in their project — the traversal problem in a different coat. Each skipped
 * link produces a warning, because silently ignoring a file the user can see is
 * worse than explaining why.
 *
 * A scan always completes. An unreadable directory, a file that vanished
 * mid-scan, a name that cannot be represented: each becomes a diagnostic and
 * the walk continues, because one bad entry must not cost the user every other
 * page.
 */
export async function scan(options: ScanOptions): Promise<ScanResult> {
  const extra = new Set(options.ignore ?? []);
  const documents: DiscoveredDocument[] = [];
  const diagnostics: DocumentDiagnostic[] = [];

  const walk = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (cause) {
      const relative = path.relative(options.root, directory) || ".";
      diagnostics.push({
        code:
          directory === options.root
            ? scannerCodes.rootUnreadable
            : scannerCodes.unreadable,
        // An unreadable root leaves nothing to serve at all; an unreadable
        // subdirectory costs only its own contents.
        severity: directory === options.root ? "fatal" : "warning",
        stage: "scanner",
        message: `Could not read "${relative}" (${errorCode(cause) ?? "unknown error"}). ${
          directory === options.root
            ? "The documentation root must be a readable directory."
            : "Its contents are missing from this scan."
        }`,
        cause,
      });
      return;
    }

    // Sorted so that discovery, and therefore event order, does not depend on
    // the file system's own ordering.
    const sorted = [...entries].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );

    for (const entry of sorted) {
      if (isIgnored(entry.name, extra)) {
        continue;
      }

      const absolute = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        diagnostics.push({
          code: scannerCodes.symlinkSkipped,
          severity: "warning",
          stage: "scanner",
          message: `Skipped the symbolic link "${toRelative(options.root, absolute)}".`,
          hint: "Links are not followed, because one can point outside the documentation root. Copy the file into the project, or move the real directory here.",
        });
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      let stats;
      try {
        stats = await lstat(absolute);
      } catch {
        // The file was listed and then vanished. That is ordinary while an
        // editor is saving, and the next scan will see whatever replaced it.
        continue;
      }

      const discovered = discoverDocument(
        path.relative(options.root, absolute),
        { size: stats.size, modifiedAtMs: stats.mtimeMs },
      );

      if (discovered.ok) {
        documents.push(discovered.value);
      } else if (
        discovered.diagnostic.code !== documentCodes.unsupportedFormat
      ) {
        // An unsupported extension is not a problem worth reporting: images,
        // licences and archives sit beside documentation all the time.
        diagnostics.push(discovered.diagnostic);
      }
    }
  };

  await walk(options.root);

  return { snapshot: toSnapshot(documents), diagnostics };
}

function toRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}
