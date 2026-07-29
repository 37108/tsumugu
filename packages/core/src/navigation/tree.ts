import {
  dedupeDiagnostics,
  type DocumentDiagnostic,
} from "../document/diagnostics.js";
import type { RoutePath, SourcePath } from "../document/paths.js";
import type { ResolvedMetadata } from "../metadata/resolve.js";

/**
 * Navigation, derived from the file system.
 *
 * A sidebar is the one part of a documentation site people expect to configure,
 * and it is the one part that goes stale fastest when they do: a file is added,
 * the config is not, and the page exists but nobody can find it. So navigation
 * is not configured here. It is a function of the documents that exist, their
 * directories and their metadata — which is what `docs/designs/principles.md` means by
 * the file system being the source of truth.
 *
 * This module is plain data in, plain data out. It knows nothing about HTML,
 * themes or requests; the shell decides what a navigation item looks like, and
 * this decides what the items *are*. That is what lets ordering be tested
 * without rendering anything.
 */

/** What navigation needs to know about one document. */
export interface NavigationDocument {
  readonly sourcePath: SourcePath;
  /** Path relative to the navigation scope, when it differs from the source. */
  readonly navigationPath?: SourcePath;
  readonly route: RoutePath;
  readonly metadata: Pick<
    ResolvedMetadata,
    "title" | "description" | "order" | "hidden"
  >;
}

/**
 * One entry in the tree.
 *
 * A directory with an `index` document and a directory without one are the same
 * kind of entry, distinguished by whether `route` is present. Modelling them as
 * two kinds would make every consumer branch on something it does not care
 * about: a sidebar renders a label, links it when there is somewhere to link,
 * and lists the children either way.
 */
export interface NavigationItem {
  readonly label: string;
  /**
   * The document's description, when it has one.
   *
   * Carried because the generated landing page lists entries with a line of
   * explanation, and inventing that line is the one thing a generated page must
   * not do. A sidebar that has no room for it simply ignores it.
   */
  readonly description?: string;
  /** Where the entry links to, or `undefined` for a directory with no index. */
  readonly route?: RoutePath;
  /** The file this entry stands for, when one exists. */
  readonly sourcePath?: SourcePath;
  readonly children: readonly NavigationItem[];
}

export interface Navigation {
  readonly items: readonly NavigationItem[];
  readonly diagnostics: readonly DocumentDiagnostic[];
}

export const navigationCodes = {
  duplicateLabel: "navigation/duplicate-label",
} as const;

/** A directory while the tree is being assembled. */
interface DirectoryNode {
  /** Path segments from the root, used as the final ordering tie-breaker. */
  readonly path: readonly string[];
  /** The document that *is* this directory, such as `guide/index.md`. */
  index?: NavigationDocument;
  readonly documents: NavigationDocument[];
  readonly directories: Map<string, DirectoryNode>;
}

function emptyDirectory(path: readonly string[]): DirectoryNode {
  return { path, documents: [], directories: new Map() };
}

/**
 * Compares two strings by code unit.
 *
 * Deliberately not `localeCompare`: collation depends on the machine's locale
 * and on the ICU data the runtime was built with, so the same project would
 * order its sidebar differently on a contributor's laptop and in CI. A
 * documentation tool that cannot promise the same output twice cannot be
 * diffed, and `docs/designs/testing.md` requires determinism across platforms. Sorting
 * that is *correct for a language* is a real need, and it is a later, explicit
 * feature rather than an accident of the default.
 */
function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

interface SortKey {
  /** Explicit `order` metadata, or `undefined` when the author gave none. */
  readonly order: number | undefined;
  readonly label: string;
  readonly tieBreaker: string;
}

/**
 * The sorting policy, in one place.
 *
 * 1. Documents with an explicit `order` come first, ascending. An author who
 *    numbered part of a directory means those pages to lead it; the rest keep
 *    their alphabetical order rather than being pushed to the front.
 * 2. Then by label, so a directory nobody has ordered still reads predictably.
 * 3. Then by source path, which is unique, so the result never depends on the
 *    order the file system happened to report.
 */
function compareItems(left: SortKey, right: SortKey): number {
  if (left.order !== right.order) {
    if (left.order === undefined) {
      return 1;
    }
    if (right.order === undefined) {
      return -1;
    }
    return left.order - right.order;
  }

  const byLabel = compareText(left.label, right.label);
  return byLabel === 0
    ? compareText(left.tieBreaker, right.tieBreaker)
    : byLabel;
}

/** Walks to the directory node for a path, creating what is missing. */
function directoryFor(
  root: DirectoryNode,
  segments: readonly string[],
): DirectoryNode {
  let current = root;
  for (const [index, segment] of segments.entries()) {
    const existing = current.directories.get(segment);
    if (existing === undefined) {
      const created = emptyDirectory(segments.slice(0, index + 1));
      current.directories.set(segment, created);
      current = created;
    } else {
      current = existing;
    }
  }
  return current;
}

/**
 * A directory's own name, made readable.
 *
 * Only reached for a directory with no index document, so there is no title to
 * inherit and no front matter to read. Separators become spaces for the same
 * reason `titleFromFileName` does it; numeric prefixes stay, for the same
 * reason they stay everywhere else.
 */
function labelFromDirectoryName(name: string): string {
  const readable = name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (readable === "") {
    return name;
  }
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

function toItems(directory: DirectoryNode): {
  readonly items: readonly NavigationItem[];
  readonly diagnostics: readonly DocumentDiagnostic[];
} {
  const diagnostics: DocumentDiagnostic[] = [];
  const entries: { readonly key: SortKey; readonly item: NavigationItem }[] =
    [];

  for (const document of directory.documents) {
    entries.push({
      key: {
        order: document.metadata.order,
        label: document.metadata.title,
        tieBreaker: document.sourcePath,
      },
      item: {
        label: document.metadata.title,
        ...(document.metadata.description === undefined
          ? {}
          : { description: document.metadata.description }),
        route: document.route,
        sourcePath: document.sourcePath,
        children: [],
      },
    });
  }

  for (const [name, child] of directory.directories) {
    const nested = toItems(child);
    diagnostics.push(...nested.diagnostics);

    // A directory whose documents are all hidden, and which has no page of its
    // own, would be an entry that leads nowhere and lists nothing.
    if (nested.items.length === 0 && child.index === undefined) {
      continue;
    }

    const label =
      child.index === undefined
        ? labelFromDirectoryName(name)
        : child.index.metadata.title;

    entries.push({
      key: {
        order: child.index?.metadata.order,
        label,
        tieBreaker: child.path.join("/"),
      },
      item: {
        label,
        // The index document is the directory, not a child of it. Listing it
        // both ways is the duplicate entry every hand-written sidebar grows.
        ...(child.index?.metadata.description === undefined
          ? {}
          : { description: child.index.metadata.description }),
        ...(child.index === undefined
          ? {}
          : { route: child.index.route, sourcePath: child.index.sourcePath }),
        children: nested.items,
      },
    });
  }

  entries.sort((left, right) => compareItems(left.key, right.key));

  const items = entries.map((entry) => entry.item);
  diagnostics.push(...duplicateLabelWarnings(items));

  return { items, diagnostics };
}

/**
 * Warns when two siblings read identically.
 *
 * Two entries called "Setup" in one section are indistinguishable to a reader
 * and ambiguous to anyone describing the page out loud. It is a warning rather
 * than an error because the pages are still correct, still routable and still
 * linked — only the sidebar is confusing, and only the author can decide which
 * title to change.
 */
function duplicateLabelWarnings(
  items: readonly NavigationItem[],
): readonly DocumentDiagnostic[] {
  const byLabel = new Map<string, NavigationItem[]>();
  for (const item of items) {
    const group = byLabel.get(item.label);
    if (group === undefined) {
      byLabel.set(item.label, [item]);
    } else {
      group.push(item);
    }
  }

  const diagnostics: DocumentDiagnostic[] = [];
  for (const [label, group] of byLabel) {
    if (group.length < 2) {
      continue;
    }
    for (const item of group) {
      diagnostics.push({
        code: navigationCodes.duplicateLabel,
        severity: "warning",
        stage: "navigation",
        message: `More than one navigation entry is called "${label}".`,
        hint: 'Give one of them a "title" in front matter, so a reader can tell them apart.',
        ...(item.sourcePath === undefined
          ? {}
          : { sourcePath: item.sourcePath }),
        related: group
          .filter((other) => other !== item && other.sourcePath !== undefined)
          .map((other) => ({
            message: `Also called "${label}".`,
            ...(other.sourcePath === undefined
              ? {}
              : { sourcePath: other.sourcePath }),
          })),
      });
    }
  }

  return diagnostics;
}

/**
 * Builds the navigation tree.
 *
 * Hidden documents are left out of the tree and left alone everywhere else:
 * their routes still work, so a link already pointing at one keeps working.
 * That is what `hidden` means — unlisted, not unreachable.
 */
export function buildNavigation(
  documents: readonly NavigationDocument[],
  rootRoute: RoutePath = "/" as RoutePath,
): Navigation {
  const root = emptyDirectory([]);

  for (const document of documents) {
    if (document.metadata.hidden) {
      continue;
    }

    const segments = (document.navigationPath ?? document.sourcePath).split(
      "/",
    );
    const directories = segments.slice(0, -1);
    const directory = directoryFor(root, directories);

    // The document's route matching its directory's route is what makes it the
    // directory's own page. Asking routing rather than matching `index.*` by
    // name keeps one definition of "this file is its directory".
    const suffix = directories.join("/");
    const directoryRoute =
      suffix === ""
        ? rootRoute
        : `${rootRoute === "/" ? "" : rootRoute}/${suffix}`;
    if (document.route === directoryRoute) {
      directory.index = document;
    } else {
      directory.documents.push(document);
    }
  }

  const built = toItems(root);
  const home = root.index;

  // The root has no entry of its own to hang a label on, so the site's home
  // page is listed as a top-level item — and listed first, ahead of the sorting
  // policy. Alphabetical order would file it between two sections, and a
  // sidebar where "Home" sits under "Guide" reads as an accident.
  if (home === undefined) {
    return built;
  }

  const items: readonly NavigationItem[] = [
    {
      label: home.metadata.title,
      ...(home.metadata.description === undefined
        ? {}
        : { description: home.metadata.description }),
      route: home.route,
      sourcePath: home.sourcePath,
      children: [],
    },
    ...built.items,
  ];

  return {
    items,
    diagnostics: dedupeDiagnostics([
      ...built.diagnostics,
      ...duplicateLabelWarnings(items),
    ]),
  };
}

/**
 * The path from the tree's root to the item for `route`.
 *
 * A sidebar needs this to mark the current page and to show the sections
 * containing it as open. Returning the trail rather than mutating the tree
 * keeps the tree the same data for every request, which is what lets it be
 * built once and shared.
 */
export function navigationTrail(
  items: readonly NavigationItem[],
  route: RoutePath,
): readonly NavigationItem[] {
  for (const item of items) {
    if (item.route === route) {
      return [item];
    }
    const nested = navigationTrail(item.children, route);
    if (nested.length > 0) {
      return [item, ...nested];
    }
  }
  return [];
}
