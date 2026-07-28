import type { DocumentDiagnostic } from "../document/diagnostics.js";
import type { RoutePath } from "../document/paths.js";
import type { NavigationItem } from "../navigation/tree.js";
import { navigationTrail } from "../navigation/tree.js";
import type { TableOfContentsEntry } from "../navigation/table-of-contents.js";
import { encodeRoutePath } from "../routing/routes.js";
import { element, fragment, text, trustedHtml } from "../theme/virtual-tree.js";
import type { VirtualNode } from "../theme/virtual-tree.js";

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
      ),
      ...(hasNavigation
        ? [
            element(
              "nav",
              { class: "tsumugu-sidebar", "aria-label": "Documentation" },
              element(
                "details",
                { class: "tsumugu-disclosure", open: true },
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
  );

  const head = fragment(
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

  // "Page title · Site" is the order a browser tab truncates from the right,
  // so the part that distinguishes one open tab from another survives.
  const documentTitle =
    input.title === input.siteName
      ? input.title
      : `${input.title} · ${input.siteName}`;

  return { body, head, documentTitle };
}
