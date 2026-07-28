import {
  dedupeDiagnostics,
  type DocumentDiagnostic,
} from "../document/diagnostics.js";
import type { DocumentNode } from "../ast/nodes.js";
import type { RoutePath, SourcePath } from "../document/paths.js";
import { resolveMetadata, type ResolvedMetadata } from "../metadata/resolve.js";
import { renderDocument, type Renderer } from "../renderer/contract.js";
import { findRouteCollisions, routeForSource } from "../routing/routes.js";
import { diffSnapshots, type DocumentSnapshot } from "../scanner/events.js";
import {
  createFileReader,
  reconcile,
  type DocumentCache,
} from "../scanner/reconcile.js";
import { scan } from "../scanner/scan.js";
import {
  buildNavigation,
  type NavigationDocument,
} from "../navigation/tree.js";
import { buildTableOfContents } from "../navigation/table-of-contents.js";
import { renderShell } from "../shell/shell.js";
import { renderWithTheme, type Theme } from "../theme/contract.js";
import { runTransformers, type Transformer } from "../transformer/contract.js";
import { serializeDocument } from "../theme/serialize.js";
import { element } from "../theme/virtual-tree.js";

/**
 * The pipeline, composed.
 *
 * Every boundary the architecture describes appears here once, in order:
 *
 * ```text
 * scan → reconcile → route → render → transform → theme → shell → serialize
 * ```
 *
 * The point of this module is that it is short. If the abstractions chosen for
 * each stage were wrong, composing them would need adapters, special cases and
 * back-channels; instead each stage's output is the next one's input. That is
 * the architectural claim `docs/roadmap.md` set out to test, and this is the
 * test.
 *
 * Renderers and the theme arrive as parameters. Core composes them; it does not
 * choose them, and it never learns which formats or presentation exist.
 */

export interface BuildOptions {
  /** Absolute path to the documentation root. */
  readonly root: string;
  /** Renderers to choose between, in registration order. */
  readonly renderers: readonly Renderer[];
  /**
   * Transformers applied between rendering and theming, in this order.
   *
   * Optional: a project that registers none gets its documents as the
   * renderers produced them, which is what makes the stage composable rather
   * than mandatory.
   */
  readonly transformers?: readonly Transformer[];
  readonly theme: Theme;
  /** Language for the generated document element. */
  readonly lang?: string;
  /** Name shown in the header and in the browser title. */
  readonly siteName?: string;
}

/** One servable page. */
export interface Page {
  readonly route: RoutePath;
  readonly title: string;
  readonly html: string;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

/** A document after rendering, transforming and metadata resolution. */
interface PreparedDocument {
  readonly sourcePath: SourcePath;
  readonly route: RoutePath;
  readonly metadata: ResolvedMetadata;
  /** The transformed AST, or `undefined` when rendering failed. */
  readonly root?: DocumentNode;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

export interface BuildResult {
  readonly pages: ReadonlyMap<RoutePath, Page>;
  /** Problems not attributable to a single page. */
  readonly diagnostics: readonly DocumentDiagnostic[];
}

/**
 * Discovers, renders and serializes every document under `root`.
 *
 * Nothing throws for a problem with the user's project. A file that cannot be
 * read, a document no renderer claims, a theme that fails on one node: each
 * becomes a diagnostic, and every other page is still produced. The only way
 * this returns nothing is a root that cannot be read at all, which is the one
 * fatal condition the diagnostics model defines.
 */
export async function buildSite(options: BuildOptions): Promise<BuildResult> {
  const scanned = await scan({ root: options.root });

  const routes = new Map<string, RoutePath>();
  const routing: DocumentDiagnostic[] = [];

  for (const document of scanned.snapshot.values()) {
    const route = routeForSource(document.sourcePath);
    if (route.ok) {
      routes.set(document.sourcePath, route.route);
    } else {
      routing.push({
        code: "routing/unroutable",
        severity: "error",
        stage: "routing",
        message: route.message,
        sourcePath: document.sourcePath,
      });
    }
  }

  // Collisions are a property of the set, so they are found once rather than
  // per document. Serving whichever page happened to be scanned first is the
  // failure this prevents.
  const collisions = findRouteCollisions(
    [...routes.entries()].map(([sourcePath, route]) => ({
      sourcePath: sourcePath as never,
      route,
    })),
  );

  // A first build is a diff against nothing, which is the same code path an
  // incremental rebuild uses.
  const emptySnapshot: DocumentSnapshot = new Map();
  const emptyCache: DocumentCache = new Map();
  const loaded = await reconcile(
    emptyCache,
    diffSnapshots(emptySnapshot, scanned.snapshot),
    {
      readContent: createFileReader(options.root),
      // Routing already happened; this hands the answer back rather than
      // recomputing it.
      toRoute: (sourcePath) => routes.get(sourcePath) ?? ("/" as RoutePath),
    },
  );

  // Documents are prepared before any page is built, because a page needs the
  // navigation, and navigation is a property of the whole project rather than
  // of the page being rendered. A pipeline that rendered as it went would give
  // the first page a sidebar listing only itself.
  const prepared: PreparedDocument[] = [];

  for (const document of loaded.cache.values()) {
    const rendered = await renderDocument(options.renderers, document);
    const diagnostics: DocumentDiagnostic[] = [...rendered.diagnostics];

    const transformed =
      rendered.stage === "rendered"
        ? await runTransformers(options.transformers ?? [], rendered.root, {
            sourcePath: document.sourcePath,
          })
        : undefined;
    if (transformed !== undefined) {
      diagnostics.push(...transformed.diagnostics);
    }

    const metadata = resolveMetadata({
      sourcePath: document.sourcePath,
      metadata: document.metadata,
      ...(transformed === undefined ? {} : { root: transformed.root }),
    });
    diagnostics.push(...metadata.diagnostics);

    prepared.push({
      sourcePath: document.sourcePath,
      route: document.route,
      metadata,
      ...(transformed === undefined ? {} : { root: transformed.root }),
      diagnostics,
    });
  }

  const navigation = buildNavigation(
    prepared.map((entry): NavigationDocument => ({
      sourcePath: entry.sourcePath,
      route: entry.route,
      metadata: entry.metadata,
    })),
  );

  const siteName = options.siteName ?? "Documentation";
  const pages = new Map<RoutePath, Page>();

  for (const entry of prepared) {
    const pageDiagnostics: DocumentDiagnostic[] = [...entry.diagnostics];

    // A document that failed to render still gets a page, so the server can
    // explain the failure instead of returning nothing.
    const body =
      entry.root === undefined
        ? {
            tree: element(
              "p",
              {},
              "This document could not be rendered. See the problems listed below.",
            ),
            diagnostics: [],
          }
        : renderWithTheme(options.theme, {
            root: entry.root,
            metadata: entry.metadata,
            sourcePath: entry.sourcePath,
          });
    pageDiagnostics.push(...body.diagnostics);

    const shell = renderShell({
      siteName,
      title: entry.metadata.title,
      ...(entry.metadata.description === undefined
        ? {}
        : { description: entry.metadata.description }),
      currentRoute: entry.route,
      navigation: navigation.items,
      tableOfContents:
        entry.root === undefined ? [] : buildTableOfContents(entry.root),
      content: body.tree,
      diagnostics: dedupeDiagnostics(pageDiagnostics),
      ...(options.theme.stylesheet === undefined
        ? {}
        : { themeStylesheet: options.theme.stylesheet }),
    });

    const serialized = serializeDocument(shell.body, {
      lang: options.lang ?? "en",
      title: shell.documentTitle,
      head: shell.head,
    });
    pageDiagnostics.push(...serialized.diagnostics);

    pages.set(entry.route, {
      route: entry.route,
      title: entry.metadata.title,
      html: serialized.html,
      diagnostics: dedupeDiagnostics(pageDiagnostics),
    });
  }

  return {
    pages,
    diagnostics: dedupeDiagnostics([
      ...scanned.diagnostics,
      ...routing,
      ...collisions,
      ...loaded.diagnostics,
      ...navigation.diagnostics,
    ]),
  };
}
