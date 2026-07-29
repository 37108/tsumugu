import { createHash } from "node:crypto";
import path from "node:path";

import type { DocumentNode, SemanticNode } from "../ast/nodes.js";
import { trustRawHtml } from "../ast/trust.js";
import {
  dedupeDiagnostics,
  type DocumentDiagnostic,
} from "../document/diagnostics.js";
import type { LoadedDocument, SourceFormat } from "../document/document.js";
import type { DocumentId, RoutePath, SourcePath } from "../document/paths.js";
import { canonicalizeLocales } from "../locales.js";
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
  /** Canonical locale directories treated as isolated content scopes. */
  readonly locales?: readonly string[];
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
  /**
   * The operator's declaration that this root's content is theirs and may run
   * as code (ADR 7).
   *
   * Off by default, and never inferred. With it, markup preserved as
   * untrusted raw source is emitted verbatim instead of as escaped text, and
   * each page carries CSP hashes for the inline scripts its renderer
   * preserved. Script *preservation* is the renderers' construction, not this
   * option: the preset wires both from one declaration.
   */
  readonly trust?: boolean;
}

/** One servable page. */
export interface Page {
  readonly route: RoutePath;
  readonly title: string;
  readonly html: string;
  readonly diagnostics: readonly DocumentDiagnostic[];
  /** True when Tsumugu wrote this page because the project had none. */
  readonly generated?: boolean;
  /**
   * CSP source expressions for the page's preserved inline scripts.
   *
   * Present only under the operator's `--trust` declaration (ADR 7). The
   * server adds them to this page's `script-src`, so exactly the scripts the
   * author wrote may run and an injected one still may not.
   */
  readonly scriptHashes?: readonly string[];
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
  /**
   * Whether this site was built under the operator's `--trust` declaration
   * (ADR 7). The server reads it to widen `script-src` with `'self'`, so a
   * trusted page may also load script files from inside the root.
   */
  readonly trust?: boolean;
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
  /** CSP source expressions for the document's preserved inline scripts. */
  readonly scriptHashes: readonly string[];
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
  const locales = canonicalizeLocales(options.locales ?? []);
  const localeSet = new Set(locales);
  const scopeDefinitions: readonly {
    readonly locale?: string;
    readonly route: RoutePath;
    readonly lang: string;
  }[] = [
    { route: rootRoute, lang: options.lang ?? "en" },
    ...locales.map((locale) => ({
      locale,
      route: `/${locale}` as RoutePath,
      lang: locale,
    })),
  ];

  const localeForSource = (sourcePath: SourcePath): string | undefined => {
    const [first] = sourcePath.split("/");
    return first !== undefined && localeSet.has(first) ? first : undefined;
  };

  const scopeForRoute = (route: string) => {
    const [first] = route.slice(1).split("/");
    return (
      scopeDefinitions.find((scope) => scope.locale === first) ??
      scopeDefinitions[0]!
    );
  };

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
    ...(options.trust === true ? { trust: true } : {}),
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
    // The declaration is applied here, after rendering and transforming, so
    // no renderer or transformer ever decides trust — they only ever see or
    // produce untrusted markup, whatever the operator said.
    const declared =
      options.trust === true ? trustRawHtml(presented) : presented;
    const themed = renderWithTheme(options.theme, {
      root: declared,
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
      // Hashed here, once per rebuild, rather than per response: the hash is
      // a property of the document's content, exactly like the page.
      scriptHashes:
        rendered.stage === "rendered" && rendered.scripts !== undefined
          ? rendered.scripts.map(
              (script) =>
                `'sha256-${createHash("sha256").update(script, "utf8").digest("base64")}'`,
            )
          : [],
      diagnostics: dedupeDiagnostics(diagnostics),
    };
  }

  /** Wraps a themed body in the shell and serializes it. */
  function toHtml(input: {
    readonly body: VirtualNode;
    readonly siteName: string;
    readonly hasSearch: boolean;
    readonly lang: string;
    readonly scopeRoute: RoutePath;
    readonly uiLang?: string;
    readonly title: string;
    readonly description?: string;
    readonly currentRoute: RoutePath;
    readonly tableOfContents: ReturnType<typeof buildTableOfContents>;
    readonly navigation: readonly NavigationItem[];
    readonly diagnostics: readonly DocumentDiagnostic[];
  }): { readonly html: string; readonly diagnostics: DocumentDiagnostic[] } {
    const shell = renderShell({
      siteName: input.siteName,
      ...(basePath === "" ? {} : { basePath }),
      scopePath: input.scopeRoute,
      ...(input.uiLang === undefined ? {} : { uiLang: input.uiLang }),
      title: input.title,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      currentRoute: input.currentRoute,
      navigation: input.navigation,
      tableOfContents: input.tableOfContents,
      content: input.body,
      diagnostics: input.diagnostics,
      search: input.hasSearch,
      ...(options.theme.stylesheet === undefined
        ? {}
        : { themeStylesheet: options.theme.stylesheet }),
      ...(options.script === undefined ? {} : { script: options.script }),
    });

    const serialized = serializeDocument(shell.body, {
      lang: input.lang,
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
    scope: {
      readonly siteName: string;
      readonly hasSearch: boolean;
      readonly lang: string;
      readonly route: RoutePath;
    },
    currentRoute: RoutePath = scope.route,
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
      siteName: scope.siteName,
      hasSearch: scope.hasSearch,
      lang: scope.lang,
      scopeRoute: scope.route,
      ...(scope.lang === "en" ? {} : { uiLang: "en" }),
      title,
      currentRoute,
      tableOfContents: buildTableOfContents(root),
      navigation,
      diagnostics: [],
    }).html;
  }

  async function update(): Promise<UpdateSummary> {
    const started = performance.now();

    const scanned = await scan({ root: options.root });

    for (const locale of locales) {
      if (!scanned.rootDirectories.includes(locale)) {
        throw new Error(
          `Locale "${locale}" directory ${path.join(options.root, locale)} was not found.`,
        );
      }
    }

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

    const scopeStates = scopeDefinitions.map((scope) => {
      const scopedEntries = entries.filter(
        (entry) => localeForSource(entry.sourcePath) === scope.locale,
      );
      const home = scopedEntries.find((entry) => entry.route === scope.route);
      const fallbackName = scope.locale ?? options.siteName ?? "Documentation";
      const siteName =
        home?.metadata.titleSource === "file-name"
          ? fallbackName
          : (home?.metadata.title ?? fallbackName);
      const navigation = buildNavigation(
        scopedEntries.map((entry) => ({
          sourcePath: entry.sourcePath,
          ...(scope.locale === undefined
            ? {}
            : {
                navigationPath: entry.sourcePath.slice(
                  scope.locale.length + 1,
                ) as SourcePath,
              }),
          route: entry.route,
          metadata: entry.metadata,
        })),
        scope.route,
      );
      const records = sortRecords(
        scopedEntries.map((entry) =>
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
      );

      return {
        ...scope,
        entries: scopedEntries,
        home,
        siteName,
        navigation,
        records,
        hasSearch: searchEntries(records).length > 0,
      };
    });

    const pages = new Map<RoutePath, Page>();
    const exports = new Map<string, ExportOutput>();
    const sitemapRecords: DocumentRecord[] = [];

    for (const scope of scopeStates) {
      const shellSignature = `${scope.siteName}\u0000${scope.lang}\u0000${scope.route}\u0000${JSON.stringify(
        scope.navigation.items,
      )}\u0000${String(scope.hasSearch)}`;

      for (const entry of scope.entries) {
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
            ...(entry.scriptHashes.length === 0
              ? {}
              : { scriptHashes: entry.scriptHashes }),
          });
          continue;
        }

        const page = toHtml({
          body: entry.body,
          siteName: scope.siteName,
          hasSearch: scope.hasSearch,
          lang: scope.lang,
          scopeRoute: scope.route,
          ...(scope.lang === "en" ? {} : { uiLang: "en" }),
          title: entry.metadata.title,
          ...(entry.metadata.description === undefined
            ? {}
            : { description: entry.metadata.description }),
          currentRoute: entry.route,
          tableOfContents: entry.tableOfContents,
          navigation: scope.navigation.items,
          diagnostics: pageDiagnostics,
        });

        const diagnostics = dedupeDiagnostics(page.diagnostics);
        entry.page = { signature, html: page.html, diagnostics };

        pages.set(entry.route, {
          route: entry.route,
          title: entry.metadata.title,
          html: page.html,
          diagnostics,
          ...(entry.scriptHashes.length === 0
            ? {}
            : { scriptHashes: entry.scriptHashes }),
        });
      }

      const generatedRecords: DocumentRecord[] = [];
      if (!pages.has(scope.route)) {
        const generatedHome = generateHomeDocument({
          siteName: scope.siteName,
          navigation: scope.navigation.items,
          ...(basePath === "" ? {} : { basePath }),
          ...(scope.lang === "en" ? {} : { contentLang: "en" }),
        });

        generatedRecords.push(
          toRecord({
            route: scope.route,
            ...(basePath === "" ? {} : { basePath }),
            title: scope.siteName,
            hidden: false,
            generated: true,
            renderable: true,
            root: generatedHome,
          }),
        );

        pages.set(scope.route, {
          route: scope.route,
          title: scope.siteName,
          html: renderGenerated(
            generatedHome,
            scope.siteName,
            scope.navigation.items,
            scope,
          ),
          diagnostics: [],
          generated: true,
        });
      }

      const exported = sortRecords([...scope.records, ...generatedRecords]);
      sitemapRecords.push(...exported);
      const site = {
        name: scope.siteName,
        ...(scope.home?.metadata.description === undefined
          ? {}
          : { description: scope.home.metadata.description }),
      };
      const prefix = scope.route === rootRoute ? "" : scope.route;

      exports.set(`${prefix}/documents.json`, {
        contentType: "application/json; charset=utf-8",
        render: () => documentsJson(exported, site),
      });
      exports.set(`${prefix}/llms.txt`, {
        contentType: "text/plain; charset=utf-8",
        render: () => llmsTxt(exported, site),
      });
      exports.set(`${prefix}/search.json`, {
        contentType: "application/json; charset=utf-8",
        render: () => searchJson(scope.records),
      });

      const searchRoute = `${prefix}/search` as RoutePath;
      if ((scope.hasSearch || locales.length > 0) && !pages.has(searchRoute)) {
        const searchDocument = generateSearchDocument({
          navigation: scope.navigation.items,
          ...(basePath === "" ? {} : { basePath }),
          ...(scope.lang === "en" ? {} : { contentLang: "en" }),
        });
        pages.set(searchRoute, {
          route: searchRoute,
          title: "Search",
          html: renderGenerated(
            searchDocument,
            "Search",
            scope.navigation.items,
            scope,
            searchRoute,
          ),
          diagnostics: [],
          generated: true,
        });
        if (locales.length > 0) {
          sitemapRecords.push(
            toRecord({
              route: searchRoute,
              ...(basePath === "" ? {} : { basePath }),
              title: "Search",
              hidden: false,
              generated: true,
              renderable: true,
              root: searchDocument,
            }),
          );
        }
      }
    }

    exports.set("/sitemap.xml", {
      contentType: "application/xml; charset=utf-8",
      render: (origin) => sitemapXml(sortRecords(sitemapRecords), origin),
    });

    result = {
      pages,
      assets: scanned.assets,
      ...(options.trust === true ? { trust: true } : {}),
      exports,
      renderNotFound: (requestedPath) => {
        const scope = scopeStates.find(
          (candidate) => candidate.route === scopeForRoute(requestedPath).route,
        )!;
        return renderGenerated(
          generateNotFoundDocument({
            requestedPath,
            navigation: scope.navigation.items,
            ...(basePath === "" ? {} : { basePath }),
            ...(scope.lang === "en" ? {} : { contentLang: "en" }),
          }),
          "Page not found",
          scope.navigation.items,
          scope,
          requestedPath as RoutePath,
        );
      },
      renderBadRequest: () => {
        const scope = scopeStates[0]!;
        return renderGenerated(
          generateBadRequestDocument(scope.lang === "en" ? undefined : "en"),
          "Bad request",
          scope.navigation.items,
          scope,
        );
      },
      diagnostics: dedupeDiagnostics([
        ...scanned.diagnostics,
        ...routing,
        ...collisions,
        ...loaded.diagnostics,
        ...scopeStates.flatMap((scope) => scope.navigation.diagnostics),
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
