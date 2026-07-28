import type { DocumentDiagnostic } from "../document/diagnostics.js";
import type { RoutePath } from "../document/paths.js";
import type { NavigationItem } from "../navigation/tree.js";
import { navigationTrail } from "../navigation/tree.js";
import type { TableOfContentsEntry } from "../navigation/table-of-contents.js";
import { encodeRoutePath } from "../routing/routes.js";
import { element, fragment, text, trustedHtml } from "../theme/virtual-tree.js";
import type { VirtualNode } from "../theme/virtual-tree.js";

import { clientScript } from "./client-script.js";
import { shellStylesheet } from "./stylesheet.js";

/**
 * The application shell.
 *
 * A theme renders a document. The shell renders everything a *documentation
 * site* is around it: where you are, what else exists, what is on this page,
 * and what went wrong. That split is the one the theme contract describes, and
 * this module is the half core keeps — so that replacing the presentation of a
 * paragraph never means reimplementing navigation, landmarks or the skip link.
 *
 * Everything here is server-rendered and static. There is no client script, and
 * not because one has not been written yet: a documentation page that needs
 * JavaScript to show its navigation is a page that fails for the reader whose
 * connection dropped halfway through, and the content security policy the
 * server sends forbids scripts outright.
 */

export interface ShellInput {
  /** Shown in the header and appended to the browser title. */
  readonly siteName: string;
  readonly title: string;
  readonly description?: string;
  readonly currentRoute: RoutePath;
  readonly navigation: readonly NavigationItem[];
  readonly tableOfContents: readonly TableOfContentsEntry[];
  /** The document, as the theme rendered it. */
  readonly content: VirtualNode;
  /** Problems with this page, shown to the person editing it. */
  readonly diagnostics: readonly DocumentDiagnostic[];
  /**
   * Whether to render the search field.
   *
   * The field is only shown when a search index exists, because a search box
   * that finds nothing is worse than no search box.
   */
  readonly search?: boolean;
  /** The theme's own stylesheet, placed after the shell's. */
  readonly themeStylesheet?: string;
  /**
   * Tsumugu's own script, when a development server asked for live reload.
   *
   * Absent on every other page Tsumugu produces, which is what keeps "a
   * documentation page runs no JavaScript" true rather than aspirational.
   */
  readonly script?: string;
}

export interface ShellResult {
  readonly body: VirtualNode;
  readonly head: VirtualNode;
  /** What belongs in `<title>`. */
  readonly documentTitle: string;
}

/** The id the skip link and the main landmark agree on. */
const mainId = "tsumugu-content";

/**
 * The default tab icon, inline.
 *
 * The same つ mark as `assets/mark.svg`, encoded rather than served: a data
 * URI needs no request, works in the static build unchanged, and cannot 404.
 */
const faviconSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
  "<style>path{stroke:#274177}@media(prefers-color-scheme:dark){path{stroke:#9db8e8}}</style>",
  '<path d="M 7 11.5 C 12 8, 22 8, 25.2 12.2 C 28.4 16.6, 23.5 23.2, 12.5 24.2" fill="none" stroke-width="4.2" stroke-linecap="round"/>',
  "</svg>",
].join("");

const faviconHref = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;

/**
 * The search field.
 *
 * A real form, addressed to a real page: with no script it submits to
 * `/search`, which lists every document. With the script it becomes a combobox
 * that filters as you type. Either way the control does something, which is the
 * difference between progressive enhancement and a decorative input.
 *
 * The ARIA here is the combobox pattern, and it is written out rather than
 * generated: focus stays on the input, the listbox is owned by it, and the
 * highlighted option is named by `aria-activedescendant` — which the script
 * sets, because it is the only thing that knows which option that is.
 */
function searchField(): VirtualNode {
  const inputId = "tsumugu-search-input";
  const listId = "tsumugu-search-results";
  const statusId = "tsumugu-search-status";

  return element(
    "form",
    {
      class: "tsumugu-search",
      "data-tsumugu-search": "true",
      role: "search",
      action: "/search",
      method: "get",
    },
    element(
      "label",
      { class: "tsumugu-visually-hidden", for: inputId },
      text("Search the documentation"),
    ),
    element("input", {
      id: inputId,
      name: "q",
      type: "search",
      placeholder: "Search…",
      autocomplete: "off",
      spellcheck: "false",
      role: "combobox",
      "aria-expanded": "false",
      "aria-controls": listId,
      "aria-autocomplete": "list",
    }),
    element("ul", { id: listId, role: "listbox", hidden: true }),
    // Announced rather than shown: a sighted reader can see the results
    // appear, and a screen-reader user cannot.
    element("p", {
      id: statusId,
      class: "tsumugu-visually-hidden",
      role: "status",
      "aria-live": "polite",
    }),
  );
}

function navigationList(
  items: readonly NavigationItem[],
  active: ReadonlySet<NavigationItem>,
  currentRoute: RoutePath,
): VirtualNode {
  return element(
    "ul",
    {},
    ...items.map((item) => {
      const isCurrent = item.route === currentRoute;

      const label =
        item.route === undefined
          ? // A directory with no index document has nowhere to link. It is
            // still a heading in the list, because leaving it out would flatten
            // the structure the files describe.
            element("span", { class: "tsumugu-nav-group" }, text(item.label))
          : element(
              "a",
              {
                href: encodeRoutePath(item.route),
                // `aria-current` is how a screen reader is told which entry is
                // the page being read. A colour alone says it only to people
                // who can see it.
                ...(isCurrent ? { "aria-current": "page" } : {}),
              },
              text(item.label),
            );

      return element(
        "li",
        {
          ...(active.has(item) ? { "data-active": "true" } : {}),
        },
        label,
        ...(item.children.length === 0
          ? []
          : [navigationList(item.children, active, currentRoute)]),
      );
    }),
  );
}

function tableOfContentsList(
  entries: readonly TableOfContentsEntry[],
): VirtualNode {
  return element(
    "ol",
    {},
    ...entries.map((entry) =>
      element(
        "li",
        {},
        element("a", { href: `#${entry.id}` }, text(entry.label)),
        ...(entry.children.length === 0
          ? []
          : [tableOfContentsList(entry.children)]),
      ),
    ),
  );
}

/**
 * The diagnostics for this page, shown on the page itself.
 *
 * A development server that hides what went wrong makes the author read logs
 * to find out why their document looks wrong. Severity is written out as text
 * as well as marked with a colour, because a warning and an error have to be
 * distinguishable without seeing the difference.
 */
function diagnosticsPanel(
  diagnostics: readonly DocumentDiagnostic[],
): VirtualNode {
  if (diagnostics.length === 0) {
    return fragment();
  }

  const heading = "tsumugu-diagnostics-heading";

  return element(
    "section",
    { class: "tsumugu-diagnostics", "aria-labelledby": heading },
    element(
      "h2",
      { id: heading },
      text(
        diagnostics.length === 1
          ? "1 problem with this document"
          : `${String(diagnostics.length)} problems with this document`,
      ),
    ),
    element(
      "ul",
      {},
      ...diagnostics.map((diagnostic) =>
        element(
          "li",
          { "data-severity": diagnostic.severity },
          element(
            "span",
            { class: "tsumugu-severity" },
            text(diagnostic.severity),
          ),
          element(
            "span",
            { class: "tsumugu-message" },
            text(diagnostic.message),
          ),
          ...(diagnostic.hint === undefined
            ? []
            : [
                element(
                  "span",
                  { class: "tsumugu-hint" },
                  text(diagnostic.hint),
                ),
              ]),
          element("code", {}, text(diagnostic.code)),
        ),
      ),
    ),
  );
}

/**
 * Builds the page.
 *
 * Regions that have nothing to show are **not rendered at all**. An empty
 * `nav` landmark is announced as navigation that turns out to contain nothing,
 * which wastes the time of the reader least able to skip it — so a project with
 * one page has no sidebar, and a page with no sections has no table of
 * contents.
 */
export function renderShell(input: ShellInput): ShellResult {
  const trail = new Set(navigationTrail(input.navigation, input.currentRoute));
  const hasNavigation = input.navigation.length > 0;
  const hasContents = input.tableOfContents.length > 0;

  const body = fragment(
    // First in the tab order, visible only when focused: the way past a
    // sidebar that would otherwise be re-read on every page.
    element(
      "a",
      { class: "tsumugu-skip", href: `#${mainId}` },
      text("Skip to content"),
    ),
    element(
      "div",
      {
        class: "tsumugu-shell",
        ...(hasContents ? { "data-contents": "true" } : {}),
      },
      element(
        "header",
        { class: "tsumugu-header" },
        element(
          "a",
          { class: "tsumugu-brand", href: "/" },
          text(input.siteName),
        ),
        ...(input.search === true ? [searchField()] : []),
      ),
      ...(hasNavigation
        ? [
            element(
              "nav",
              { class: "tsumugu-sidebar", "aria-label": "Documentation" },
              // Closed by default: on a narrow screen a large project would
              // otherwise put its whole navigation above the content. The
              // wide layout forces the list visible through ::details-content,
              // so the closed state only means anything where collapsing is
              // wanted.
              element(
                "details",
                { class: "tsumugu-disclosure" },
                element("summary", {}, text("Documentation")),
                navigationList(input.navigation, trail, input.currentRoute),
              ),
            ),
          ]
        : []),
      element(
        "main",
        { class: "tsumugu-main", id: mainId },
        element("article", { class: "tsumugu-doc" }, input.content),
        diagnosticsPanel(input.diagnostics),
      ),
      ...(hasContents
        ? [
            element(
              "nav",
              { class: "tsumugu-toc", "aria-label": "On this page" },
              element("h2", {}, text("On this page")),
              tableOfContentsList(input.tableOfContents),
            ),
          ]
        : []),
      element(
        "footer",
        { class: "tsumugu-footer" },
        element("p", {}, text(`${input.siteName} · built with Tsumugu`)),
      ),
    ),
    // Last in the body, not in the head: a script in the head runs before the
    // elements it is about exist, and would quietly find nothing. Always
    // present, even with no search field, because it also creates the copy
    // buttons on code blocks; the search half exits when the form is absent.
    element(
      "script",
      {},
      trustedHtml(
        clientScript,
        "Tsumugu's own page client, allowed by its hash in the content security policy",
      ),
    ),
    ...(input.script === undefined
      ? []
      : [
          element(
            "script",
            {},
            trustedHtml(
              input.script,
              "Tsumugu's own development script, allowed by its hash in the content security policy",
            ),
          ),
        ]),
  );

  const head = fragment(
    // The mark — つ, the first syllable of 紡ぐ, drawn as one stroke of
    // thread — as a data URI, so a project gets a tab icon without shipping a
    // file. A favicon.svg or favicon.ico in the documentation root wins,
    // because this link points at it the moment the asset exists; the data
    // URI is only the default for projects that never thought about it.
    element("link", {
      rel: "icon",
      type: "image/svg+xml",
      href: faviconHref,
    }),
    // The browser's own chrome, told what colour the page is in each scheme,
    // so a phone's status bar never sits in a different palette to the page
    // under it.
    element("meta", {
      name: "theme-color",
      content: "#fcfbf8",
      media: "(prefers-color-scheme: light)",
    }),
    element("meta", {
      name: "theme-color",
      content: "#14161b",
      media: "(prefers-color-scheme: dark)",
    }),
    ...(input.description === undefined
      ? []
      : [element("meta", { name: "description", content: input.description })]),
    element(
      "style",
      {},
      trustedHtml(
        shellStylesheet,
        "core's own shell stylesheet, a constant in this package",
      ),
    ),
    ...(input.themeStylesheet === undefined
      ? []
      : [
          element(
            "style",
            {},
            trustedHtml(
              input.themeStylesheet,
              "the registered theme's own stylesheet, supplied by the composition root",
            ),
          ),
        ]),
  );

  // "Page title · Site" is the order a browser tab truncates from the right,
  // so the part that distinguishes one open tab from another survives.
  const documentTitle =
    input.title === input.siteName
      ? input.title
      : `${input.title} · ${input.siteName}`;

  return { body, head, documentTitle };
}
