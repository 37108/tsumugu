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

import {
  generateBadRequestDocument,
  generateHomeDocument,
  generateNotFoundDocument,
} from "./generated.js";
import { renderWithTheme, type Theme } from "../theme/contract.js";
import { runTransformers, type Transformer } from "../transformer/contract.js";
import { serializeDocument } from "../theme/serialize.js";

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
  /** True when Tsumugu wrote this page because the project had none. */
  readonly generated?: boolean;
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
  /**
   * Renders the page for a request that resolved to no document.
   *
   * A function rather than a page, because it names the path that was asked
   * for — and the server is the only thing that knows it.
   */
  readonly renderNotFound: (requestedPath: string) => string;
  /** Renders the page for a request path that could not be read at all. */
  readonly renderBadRequest: () => string;
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
      // The rendered document carries what the source declared; the loaded one
      // only knows what could be read without parsing it.
      metadata: rendered.metadata,
      ...(rendered.stage === "rendered" && rendered.htmlTitle !== undefined
        ? { htmlTitle: rendered.htmlTitle }
        : {}),
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

  /**
   * Renders one page: theme, shell, serializer.
   *
   * Generated pages — the landing page, the 404, the 400 — go through this too.
   * A page that took a shortcut around the theme would be the one page that
   * looked like a different site.
   */
  const renderPage = (input: {
    readonly root: DocumentNode;
    readonly title: string;
    readonly description?: string;
    readonly sourcePath: SourcePath;
    readonly currentRoute: RoutePath;
    readonly diagnostics: readonly DocumentDiagnostic[];
  }): {
    readonly html: string;
    readonly diagnostics: readonly DocumentDiagnostic[];
  } => {
    const diagnostics = [...input.diagnostics];

    const body = renderWithTheme(options.theme, {
      root: input.root,
      metadata: {
        title: input.title,
        titleSource: "file-name",
        hidden: false,
        diagnostics: [],
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
      },
      sourcePath: input.sourcePath,
    });
    diagnostics.push(...body.diagnostics);

    const shell = renderShell({
      siteName,
      title: input.title,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      currentRoute: input.currentRoute,
      navigation: navigation.items,
      tableOfContents: buildTableOfContents(input.root),
      content: body.tree,
      diagnostics: dedupeDiagnostics(diagnostics),
      ...(options.theme.stylesheet === undefined
        ? {}
        : { themeStylesheet: options.theme.stylesheet }),
    });

    const serialized = serializeDocument(shell.body, {
      lang: options.lang ?? "en",
      title: shell.documentTitle,
      head: shell.head,
    });

    return {
      html: serialized.html,
      diagnostics: dedupeDiagnostics([
        ...diagnostics,
        ...serialized.diagnostics,
      ]),
    };
  };

  const pages = new Map<RoutePath, Page>();

  for (const entry of prepared) {
    // A document that failed to render still gets a page, so the server can
    // explain the failure instead of returning nothing.
    const root: DocumentNode = entry.root ?? {
      type: "document",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value:
                "This document could not be rendered. The problems below say why.",
            },
          ],
        },
      ],
    };

    const rendered = renderPage({
      root,
      title: entry.metadata.title,
      ...(entry.metadata.description === undefined
        ? {}
        : { description: entry.metadata.description }),
      sourcePath: entry.sourcePath,
      currentRoute: entry.route,
      diagnostics: entry.diagnostics,
    });

    pages.set(entry.route, {
      route: entry.route,
      title: entry.metadata.title,
      html: rendered.html,
      diagnostics: rendered.diagnostics,
    });
  }

  const rootRoute = "/" as RoutePath;

  // A project whose root has no index document still has a home page: one
  // listing what it does have. An authored index always wins, because the
  // generated page is a default rather than a policy.
  if (!pages.has(rootRoute)) {
    const generated = renderPage({
      root: generateHomeDocument({ siteName, navigation: navigation.items }),
      title: siteName,
      sourcePath: "" as SourcePath,
      currentRoute: rootRoute,
      diagnostics: [],
    });

    pages.set(rootRoute, {
      route: rootRoute,
      title: siteName,
      html: generated.html,
      diagnostics: generated.diagnostics,
      generated: true,
    });
  }

  return {
    pages,
    renderNotFound: (requestedPath) =>
      renderPage({
        root: generateNotFoundDocument({
          requestedPath,
          navigation: navigation.items,
        }),
        title: "Page not found",
        sourcePath: "" as SourcePath,
        currentRoute: rootRoute,
        diagnostics: [],
      }).html,
    renderBadRequest: () =>
      renderPage({
        root: generateBadRequestDocument(),
        title: "Bad request",
        sourcePath: "" as SourcePath,
        currentRoute: rootRoute,
        diagnostics: [],
      }).html,
    diagnostics: dedupeDiagnostics([
      ...scanned.diagnostics,
      ...routing,
      ...collisions,
      ...loaded.diagnostics,
      ...navigation.diagnostics,
    ]),
  };
}
