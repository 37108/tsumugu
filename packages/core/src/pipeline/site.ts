import type { DocumentNode, SemanticNode } from "../ast/nodes.js";
import {
  dedupeDiagnostics,
  type DocumentDiagnostic,
} from "../document/diagnostics.js";
import type { LoadedDocument, SourceFormat } from "../document/document.js";
import type { DocumentId, RoutePath, SourcePath } from "../document/paths.js";
import { resolveMetadata, type ResolvedMetadata } from "../metadata/resolve.js";
import { buildTableOfContents } from "../navigation/table-of-contents.js";
import { buildNavigation, type NavigationItem } from "../navigation/tree.js";
import { renderDocument, type Renderer } from "../renderer/contract.js";
import { findRouteCollisions, routeForSource } from "../routing/routes.js";
import { diffSnapshots, type DocumentSnapshot } from "../scanner/events.js";
import { createFileReader, reconcile } from "../scanner/reconcile.js";
import { scan } from "../scanner/scan.js";
import { documentsJson, llmsTxt, sitemapXml } from "../exports/outputs.js";
import {
  sortRecords,
  toRecord,
  type DocumentRecord,
} from "../exports/records.js";
import { searchEntries, searchJson } from "../exports/search.js";
import { collectReferences } from "../links/collect.js";
import { validateDocumentLinks } from "../links/validate.js";
import { renderShell } from "../shell/shell.js";
import { renderWithTheme, type Theme } from "../theme/contract.js";
import { serializeDocument } from "../theme/serialize.js";
import type { VirtualNode } from "../theme/virtual-tree.js";
import { runTransformers, type Transformer } from "../transformer/contract.js";

import {
  generateBadRequestDocument,
  generateHomeDocument,
  generateNotFoundDocument,
  generateSearchDocument,
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
   * Path prefix the site is published under — `/tsumugu` on a GitHub Pages
   * project site, empty everywhere else.
   *
   * Routes stay unprefixed internally; the prefix is applied where URLs are
   * written into pages and exports, and to root-relative links the authors
   * wrote, so a document saying `/guide/setup` keeps meaning its own site.
   */
  readonly basePath?: string;
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

/** A generated file that is not a page: JSON, plain text, XML. */
export interface ExportOutput {
  readonly contentType: string;
  /**
   * Produces the body.
   *
   * A function of the origin, because a sitemap has to say where the site is
   * published and only the server knows what it answered on.
   */
  readonly render: (origin: string) => string;
}

export interface BuildResult {
  readonly pages: ReadonlyMap<RoutePath, Page>;
  /**
   * Files in the root that are not documents, relative and POSIX-separated.
   *
   * The server reads them on demand; a static build copies them. Both need to
   * know what they are without walking the tree a second time.
   */
  readonly assets: readonly string[];
  /**
   * Machine-readable outputs, by request path.
   *
   * Generated from the same documents the pages are, which is what "human and
   * AI from one source" has to mean to be worth saying.
   */
  readonly exports: ReadonlyMap<string, ExportOutput>;
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
  /** Wall-clock cost of the whole update, in milliseconds. */
  readonly durationMs: number;
}

/**
 * A built site that can be rebuilt.
 *
 * `result` is a fresh value after every update, so a server holding the site
 * always answers from the current pages without being told to reload anything.
 *
 * **A failed update changes nothing.** The new result is assigned once, at the
 * end, after every page has been produced; anything that throws on the way
 * there leaves the previous result in place. So a documentation root that
 * disappears while the server is running, or a transformer that throws on a
 * half-saved file, costs the reader nothing: they keep the last version that
 * built, and the terminal says why it has not moved.
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
  readonly format: SourceFormat;
  readonly metadata: ResolvedMetadata;
  /** The transformed AST, kept for the machine-readable exports. */
  readonly root?: DocumentNode;
  /** Identifies the exact content this was produced from. */
  readonly contentHash: string;
  /** The themed document body. */
  readonly body: VirtualNode;
  readonly tableOfContents: ReturnType<typeof buildTableOfContents>;
  /** Where this document points, and what it can be pointed at. */
  readonly references: ReturnType<typeof collectReferences>;
  readonly diagnostics: readonly DocumentDiagnostic[];
  /**
   * The page this document last produced, and what it depended on.
   *
   * Serializing a page is cheap next to parsing one and expensive next to
   * nothing, and a project with a thousand documents rebuilds a thousand pages
   * every time one of them changes — because every page carries the navigation.
   * So the HTML is kept with a signature of everything outside the document
   * that went into it, and reused when that signature has not moved.
   */
  page?: {
    readonly signature: string;
    readonly html: string;
    readonly diagnostics: readonly DocumentDiagnostic[];
  };
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
/** Rewrites root-relative link and image URLs under the base path. */
function withBasePath<T extends SemanticNode>(node: T, basePath: string): T {
  if (
    (node.type === "link" || node.type === "image") &&
    node.url.startsWith("/") &&
    !node.url.startsWith("//")
  ) {
    return { ...node, url: `${basePath}${node.url}` };
  }
  if (!("children" in node)) {
    return node;
  }

  const children = node.children.map((child: SemanticNode) =>
    withBasePath(child, basePath),
  );
  const changed = children.some(
    (child: SemanticNode, index: number) => child !== node.children[index],
  );
  return changed ? { ...node, children } : node;
}

export async function createSite(options: BuildOptions): Promise<Site> {
  const rootRoute = "/" as RoutePath;
  const basePath = options.basePath ?? "";

  /**
   * What the site is called.
   *
   * The home page's own title wins, when there is one. A project that has
   * written `# Tsumugu` at the top of its index has already named itself, and
   * asking again — through an option, or by showing the directory name beside
   * it — would be asking a question the documentation answered.
   */
  let siteName = options.siteName ?? "Documentation";

  /**
   * Whether the shell should show a search field.
   *
   * A project with nothing to search does not get a control that finds
   * nothing, so this is decided by the index rather than by an option.
   */
  let hasSearch = false;

  // State that survives an update, and is the only thing that does.
  let documents: ReadonlyMap<DocumentId, LoadedDocument> = new Map();
  const prepared = new Map<DocumentId, PreparedDocument>();
  let snapshot: DocumentSnapshot = new Map();

  let result: BuildResult = {
    pages: new Map(),
    assets: [],
    exports: new Map(),
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
    // Presentation sees the base-prefixed URLs; validation and the exports
    // keep the unprefixed tree, because a link is checked against routes and
    // routes never carry the prefix.
    const presented = basePath === "" ? root : withBasePath(root, basePath);
    const themed = renderWithTheme(options.theme, {
      root: presented,
      metadata,
      sourcePath: document.sourcePath,
    });
    diagnostics.push(...themed.diagnostics);

    return {
      sourcePath: document.sourcePath,
      route: document.route,
      format: document.format,
      metadata,
      ...(transformed === undefined ? {} : { root: transformed.root }),
      contentHash: document.contentHash,
      body: themed.tree,
      tableOfContents:
        transformed === undefined ? [] : buildTableOfContents(root),
      // Collected while the tree is in hand. Finding a project's links again
      // after every edit would mean parsing every file again after every edit.
      references: collectReferences(root),
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
      ...(basePath === "" ? {} : { basePath }),
      title: input.title,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      currentRoute: input.currentRoute,
      navigation: input.navigation,
      tableOfContents: input.tableOfContents,
      content: input.body,
      diagnostics: input.diagnostics,
      search: hasSearch,
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
    const started = performance.now();
    const scanned = await scan({ root: options.root });

    // The one fatal condition the diagnostics model defines: the root cannot be
    // read. There is no partial result worth building from it, and replacing a
    // working site with an empty one would turn a directory somebody moved for
    // a moment into a site that lost every page.
    const fatal = scanned.diagnostics.find(
      (diagnostic) => diagnostic.severity === "fatal",
    );
    if (fatal !== undefined) {
      throw new Error(fatal.message, { cause: fatal });
    }

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

    const home = entries.find((entry) => entry.route === rootRoute);
    siteName =
      home?.metadata.titleSource === "file-name"
        ? (options.siteName ?? "Documentation")
        : (home?.metadata.title ?? options.siteName ?? "Documentation");

    const navigation = buildNavigation(
      entries.map((entry) => ({
        sourcePath: entry.sourcePath,
        route: entry.route,
        metadata: entry.metadata,
      })),
    );

    // Link validation is a property of the whole project, so it runs once the
    // set of routes and heading identifiers is complete — and it runs over the
    // references collected earlier rather than over the documents themselves,
    // so an edit revalidates the project without re-reading it.
    const headingsByRoute = new Map<RoutePath, ReadonlySet<string>>(
      entries.map((entry) => [entry.route, entry.references.headingIds]),
    );
    const assets = new Set(scanned.assets);
    const linkTarget = {
      routes: headingsByRoute,
      hasAsset: (candidate: string) => assets.has(candidate),
    };

    const linkDiagnostics = new Map<SourcePath, readonly DocumentDiagnostic[]>(
      entries.map((entry) => [
        entry.sourcePath,
        validateDocumentLinks(
          {
            sourcePath: entry.sourcePath,
            links: entry.references.links,
            headingIds: entry.references.headingIds,
          },
          linkTarget,
        ),
      ]),
    );

    // Records first: the shell needs to know whether a search field is worth
    // showing, and that is a question about what the project contains.
    const records = sortRecords([
      ...entries.map((entry) =>
        toRecord({
          route: entry.route,
          ...(basePath === "" ? {} : { basePath }),
          sourcePath: entry.sourcePath,
          format: entry.format,
          title: entry.metadata.title,
          ...(entry.metadata.description === undefined
            ? {}
            : { description: entry.metadata.description }),
          hidden: entry.metadata.hidden,
          generated: false,
          renderable: entry.root !== undefined,
          ...(entry.root === undefined ? {} : { root: entry.root }),
          contentHash: entry.contentHash,
        }),
      ),
    ]);

    const searchable = searchEntries(records);
    hasSearch = searchable.length > 0;

    // Everything outside a document that its page depends on. Two of them: the
    // navigation, which every page shows, and the site's name, which is in
    // every title.
    const shellSignature = `${siteName}\u0000${JSON.stringify(
      navigation.items,
    )}\u0000${String(hasSearch)}`;

    const pages = new Map<RoutePath, Page>();
    for (const entry of entries) {
      const pageDiagnostics = dedupeDiagnostics([
        ...entry.diagnostics,
        ...(linkDiagnostics.get(entry.sourcePath) ?? []),
      ]);
      const signature = `${shellSignature}\u0000${JSON.stringify(pageDiagnostics)}`;

      if (entry.page?.signature === signature) {
        pages.set(entry.route, {
          route: entry.route,
          title: entry.metadata.title,
          html: entry.page.html,
          diagnostics: entry.page.diagnostics,
        });
        continue;
      }

      const page = toHtml({
        body: entry.body,
        title: entry.metadata.title,
        ...(entry.metadata.description === undefined
          ? {}
          : { description: entry.metadata.description }),
        currentRoute: entry.route,
        tableOfContents: entry.tableOfContents,
        navigation: navigation.items,
        diagnostics: pageDiagnostics,
      });

      const diagnostics = dedupeDiagnostics(page.diagnostics);
      entry.page = { signature, html: page.html, diagnostics };

      pages.set(entry.route, {
        route: entry.route,
        title: entry.metadata.title,
        html: page.html,
        diagnostics,
      });
    }

    // A project whose root has no index document still has a home page: one
    // listing what it does have. An authored index always wins, because the
    // generated page is a default rather than a policy.
    const generatedRecords: DocumentRecord[] = [];

    if (!pages.has(rootRoute)) {
      const generatedHome = generateHomeDocument({
        siteName,
        navigation: navigation.items,
        ...(basePath === "" ? {} : { basePath }),
      });

      generatedRecords.push(
        toRecord({
          route: rootRoute,
          ...(basePath === "" ? {} : { basePath }),
          title: siteName,
          hidden: false,
          generated: true,
          renderable: true,
          root: generatedHome,
        }),
      );

      pages.set(rootRoute, {
        route: rootRoute,
        title: siteName,
        html: renderGenerated(generatedHome, siteName, navigation.items),
        diagnostics: [],
        generated: true,
      });
    }

    const exported = sortRecords([...records, ...generatedRecords]);

    const site = {
      name: siteName,
      ...(home?.metadata.description === undefined
        ? {}
        : { description: home.metadata.description }),
    };

    const searchRoute = "/search" as RoutePath;
    if (searchable.length > 0 && !pages.has(searchRoute)) {
      pages.set(searchRoute, {
        route: searchRoute,
        title: "Search",
        html: renderGenerated(
          generateSearchDocument({
            navigation: navigation.items,
            ...(basePath === "" ? {} : { basePath }),
          }),
          "Search",
          navigation.items,
        ),
        diagnostics: [],
        generated: true,
      });
    }

    result = {
      pages,
      assets: scanned.assets,
      exports: new Map<string, ExportOutput>([
        [
          "/documents.json",
          {
            contentType: "application/json; charset=utf-8",
            render: () => documentsJson(exported, site),
          },
        ],
        [
          "/llms.txt",
          {
            contentType: "text/plain; charset=utf-8",
            render: () => llmsTxt(exported, site),
          },
        ],
        [
          "/search.json",
          {
            contentType: "application/json; charset=utf-8",
            render: () => searchJson(records),
          },
        ],
        [
          "/sitemap.xml",
          {
            contentType: "application/xml; charset=utf-8",
            render: (origin) => sitemapXml(exported, origin),
          },
        ],
      ]),
      renderNotFound: (requestedPath) =>
        renderGenerated(
          generateNotFoundDocument({
            requestedPath,
            navigation: navigation.items,
            ...(basePath === "" ? {} : { basePath }),
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

    return {
      rendered,
      reused,
      removed,
      serialized: pages.size,
      durationMs: performance.now() - started,
    };
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
