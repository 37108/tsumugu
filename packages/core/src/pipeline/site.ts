import type { DocumentNode } from "../ast/nodes.js";
import {
  dedupeDiagnostics,
  type DocumentDiagnostic,
} from "../document/diagnostics.js";
import type { LoadedDocument } from "../document/document.js";
import type { DocumentId, RoutePath, SourcePath } from "../document/paths.js";
import { resolveMetadata, type ResolvedMetadata } from "../metadata/resolve.js";
import { buildTableOfContents } from "../navigation/table-of-contents.js";
import { buildNavigation, type NavigationItem } from "../navigation/tree.js";
import { renderDocument, type Renderer } from "../renderer/contract.js";
import { findRouteCollisions, routeForSource } from "../routing/routes.js";
import { diffSnapshots, type DocumentSnapshot } from "../scanner/events.js";
import { createFileReader, reconcile } from "../scanner/reconcile.js";
import { scan } from "../scanner/scan.js";
import { renderShell } from "../shell/shell.js";
import { renderWithTheme, type Theme } from "../theme/contract.js";
import { serializeDocument } from "../theme/serialize.js";
import type { VirtualNode } from "../theme/virtual-tree.js";
import { runTransformers, type Transformer } from "../transformer/contract.js";

import {
  generateBadRequestDocument,
  generateHomeDocument,
  generateNotFoundDocument,
} from "./generated.js";

/**
 * The pipeline, composed — and kept, so it can be composed again cheaply.
 *
 * Every boundary the architecture describes appears here once, in order:
 *
 * ```text
 * scan → reconcile → route → render → transform → theme → shell → serialize
 * ```
 *
 * A site is built the same way whether it is being built for the first time or
 * for the fortieth time in a row while somebody edits a file. The difference is
 * only what is reused: an update re-scans, re-reads what changed, and rebuilds
 * the stages downstream of what actually moved. There is no separate
 * incremental code path, because a second implementation of the pipeline is a
 * second implementation to keep correct.
 *
 * What is cached, and why that is the right seam:
 *
 * | Cached | Cost avoided | Invalidated by |
 * | --- | --- | --- |
 * | the loaded document | reading the file | size or modification time |
 * | the themed body and its outline | parsing, transforming, theming | the file's content hash |
 * | nothing else | — | — |
 *
 * The shell is deliberately **not** cached. It is string concatenation over a
 * tree that already exists, and every page's shell contains the navigation —
 * so a title change in one document changes the sidebar on every page, and a
 * cache that tried to be cleverer about that would be a cache that serves a
 * stale sidebar.
 *
 * Renderers, transformers and the theme arrive as parameters. Core composes
 * them; it does not choose them, and it never learns which formats or which
 * presentation exist.
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
  /**
   * A script to place in every page, for a development server's live reload.
   *
   * Omitted everywhere else. The server decides whether the browser is allowed
   * to run it; the pipeline only puts it on the page.
   */
  readonly script?: string;
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

/** What an update actually did, so a caller can say so and a test can check. */
export interface UpdateSummary {
  /** Documents parsed, transformed and themed on this pass. */
  readonly rendered: number;
  /** Documents whose cached rendering was still current. */
  readonly reused: number;
  /** Documents that no longer exist and were dropped. */
  readonly removed: number;
  /** Pages whose HTML was produced on this pass. */
  readonly serialized: number;
}

/**
 * A built site that can be rebuilt.
 *
 * `result` is a fresh value after every update, so a server holding the site
 * always answers from the current pages without being told to reload anything.
 */
export interface Site {
  readonly result: BuildResult;
  /** Re-scans the root and rebuilds whatever changed. */
  update(): Promise<UpdateSummary>;
}

/** A document after rendering, transforming, metadata and theming. */
interface PreparedDocument {
  readonly sourcePath: SourcePath;
  readonly route: RoutePath;
  readonly metadata: ResolvedMetadata;
  /** Identifies the exact content this was produced from. */
  readonly contentHash: string;
  /** The themed document body. */
  readonly body: VirtualNode;
  readonly tableOfContents: ReturnType<typeof buildTableOfContents>;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

/** The document shown in place of one that could not be rendered. */
const unrenderable: DocumentNode = {
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

/**
 * Creates a site and builds it once.
 *
 * Nothing throws for a problem with the user's project. A file that cannot be
 * read, a document no renderer claims, a theme that fails on one node: each
 * becomes a diagnostic, and every other page is still produced.
 */
export async function createSite(options: BuildOptions): Promise<Site> {
  const siteName = options.siteName ?? "Documentation";
  const rootRoute = "/" as RoutePath;

  // State that survives an update, and is the only thing that does.
  let documents: ReadonlyMap<DocumentId, LoadedDocument> = new Map();
  const prepared = new Map<DocumentId, PreparedDocument>();
  let snapshot: DocumentSnapshot = new Map();

  let result: BuildResult = {
    pages: new Map(),
    renderNotFound: () => "",
    renderBadRequest: () => "",
    diagnostics: [],
  };

  /** Parses, transforms, resolves metadata and themes one document. */
  async function prepareDocument(
    document: LoadedDocument,
  ): Promise<PreparedDocument> {
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

    const root = transformed?.root ?? unrenderable;
    const themed = renderWithTheme(options.theme, {
      root,
      metadata,
      sourcePath: document.sourcePath,
    });
    diagnostics.push(...themed.diagnostics);

    return {
      sourcePath: document.sourcePath,
      route: document.route,
      metadata,
      contentHash: document.contentHash,
      body: themed.tree,
      tableOfContents:
        transformed === undefined ? [] : buildTableOfContents(root),
      diagnostics: dedupeDiagnostics(diagnostics),
    };
  }

  /** Wraps a themed body in the shell and serializes it. */
  function toHtml(input: {
    readonly body: VirtualNode;
    readonly title: string;
    readonly description?: string;
    readonly currentRoute: RoutePath;
    readonly tableOfContents: ReturnType<typeof buildTableOfContents>;
    readonly navigation: readonly NavigationItem[];
    readonly diagnostics: readonly DocumentDiagnostic[];
  }): { readonly html: string; readonly diagnostics: DocumentDiagnostic[] } {
    const shell = renderShell({
      siteName,
      title: input.title,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      currentRoute: input.currentRoute,
      navigation: input.navigation,
      tableOfContents: input.tableOfContents,
      content: input.body,
      diagnostics: input.diagnostics,
      ...(options.theme.stylesheet === undefined
        ? {}
        : { themeStylesheet: options.theme.stylesheet }),
      ...(options.script === undefined ? {} : { script: options.script }),
    });

    const serialized = serializeDocument(shell.body, {
      lang: options.lang ?? "en",
      title: shell.documentTitle,
      head: shell.head,
    });

    return {
      html: serialized.html,
      diagnostics: [...input.diagnostics, ...serialized.diagnostics],
    };
  }

  /** Themes a document Tsumugu wrote itself, such as the 404 page. */
  function renderGenerated(
    root: DocumentNode,
    title: string,
    navigation: readonly NavigationItem[],
  ): string {
    const themed = renderWithTheme(options.theme, {
      root,
      metadata: {
        title,
        titleSource: "file-name",
        hidden: false,
        diagnostics: [],
      },
      sourcePath: "" as SourcePath,
    });

    return toHtml({
      body: themed.tree,
      title,
      currentRoute: rootRoute,
      tableOfContents: buildTableOfContents(root),
      navigation,
      diagnostics: [],
    }).html;
  }

  async function update(): Promise<UpdateSummary> {
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

    // The first build is a diff against nothing, which is the same code path
    // every later update takes.
    const changes = diffSnapshots(snapshot, scanned.snapshot);
    snapshot = scanned.snapshot;

    const loaded = await reconcile(documents, changes, {
      readContent: createFileReader(options.root),
      // Routing already happened; this hands the answer back rather than
      // recomputing it.
      toRoute: (sourcePath) => routes.get(sourcePath) ?? rootRoute,
    });

    let rendered = 0;
    let reused = 0;

    for (const document of loaded.cache.values()) {
      const cached = prepared.get(document.id);

      // The content hash is what makes this safe: an editor that rewrites a
      // file with identical bytes has changed nothing worth re-parsing, and a
      // file whose route changed has a new source path anyway.
      if (cached?.contentHash === document.contentHash) {
        reused += 1;
        continue;
      }

      prepared.set(document.id, await prepareDocument(document));
      rendered += 1;
    }

    documents = loaded.cache;

    let removed = 0;
    for (const id of [...prepared.keys()]) {
      if (!loaded.cache.has(id)) {
        prepared.delete(id);
        removed += 1;
      }
    }

    const entries = [...prepared.values()];
    const navigation = buildNavigation(
      entries.map((entry) => ({
        sourcePath: entry.sourcePath,
        route: entry.route,
        metadata: entry.metadata,
      })),
    );

    const pages = new Map<RoutePath, Page>();
    for (const entry of entries) {
      const page = toHtml({
        body: entry.body,
        title: entry.metadata.title,
        ...(entry.metadata.description === undefined
          ? {}
          : { description: entry.metadata.description }),
        currentRoute: entry.route,
        tableOfContents: entry.tableOfContents,
        navigation: navigation.items,
        diagnostics: entry.diagnostics,
      });

      pages.set(entry.route, {
        route: entry.route,
        title: entry.metadata.title,
        html: page.html,
        diagnostics: dedupeDiagnostics(page.diagnostics),
      });
    }

    // A project whose root has no index document still has a home page: one
    // listing what it does have. An authored index always wins, because the
    // generated page is a default rather than a policy.
    if (!pages.has(rootRoute)) {
      pages.set(rootRoute, {
        route: rootRoute,
        title: siteName,
        html: renderGenerated(
          generateHomeDocument({ siteName, navigation: navigation.items }),
          siteName,
          navigation.items,
        ),
        diagnostics: [],
        generated: true,
      });
    }

    result = {
      pages,
      renderNotFound: (requestedPath) =>
        renderGenerated(
          generateNotFoundDocument({
            requestedPath,
            navigation: navigation.items,
          }),
          "Page not found",
          navigation.items,
        ),
      renderBadRequest: () =>
        renderGenerated(
          generateBadRequestDocument(),
          "Bad request",
          navigation.items,
        ),
      diagnostics: dedupeDiagnostics([
        ...scanned.diagnostics,
        ...routing,
        ...collisions,
        ...loaded.diagnostics,
        ...navigation.diagnostics,
      ]),
    };

    return { rendered, reused, removed, serialized: pages.size };
  }

  await update();

  return {
    get result() {
      return result;
    },
    update,
  };
}

/**
 * Builds a site once.
 *
 * The shape most callers want: everything a server needs, and no handle to
 * rebuild with. A caller that wants to rebuild uses {@link createSite}.
 */
export async function buildSite(options: BuildOptions): Promise<BuildResult> {
  return (await createSite(options)).result;
}
