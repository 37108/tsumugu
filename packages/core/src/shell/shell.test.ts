import { describe, expect, it } from "vitest";

import type { RoutePath, SourcePath } from "../document/paths.js";
import {
  buildNavigation,
  type NavigationDocument,
} from "../navigation/tree.js";
import type { TableOfContentsEntry } from "../navigation/table-of-contents.js";
import { serializeToHtml } from "../theme/serialize.js";
import { element, text } from "../theme/virtual-tree.js";

import { renderShell, type ShellInput } from "./shell.js";

function navigationDocument(
  sourcePath: string,
  route: string,
  title: string,
): NavigationDocument {
  return {
    sourcePath: sourcePath as SourcePath,
    route: route as RoutePath,
    metadata: { title, hidden: false },
  };
}

const navigation = buildNavigation([
  navigationDocument("index.md", "/", "Home"),
  navigationDocument("guide/index.md", "/guide", "Guide"),
  navigationDocument("guide/setup.md", "/guide/setup", "Setup"),
]);

const contents: readonly TableOfContentsEntry[] = [
  { id: "install", label: "Install", depth: 2, children: [] },
];

function shell(overrides: Partial<ShellInput> = {}): string {
  const result = renderShell({
    siteName: "Docs",
    title: "Setup",
    currentRoute: "/guide/setup" as RoutePath,
    navigation: navigation.items,
    tableOfContents: contents,
    content: element("p", {}, text("Body text")),
    diagnostics: [],
    ...overrides,
  });

  return serializeToHtml(result.body);
}

describe("renderShell", () => {
  it("marks up the landmarks a page is navigated by", () => {
    const html = shell();

    expect(html).toContain("<header");
    expect(html).toContain("<main");
    expect(html).toContain("<footer");
    expect(html).toContain('<nav aria-label="Documentation"');
    expect(html).toContain('<nav aria-label="On this page"');
  });

  it("puts a skip link first, pointing at the main landmark", () => {
    const html = shell();
    const skip = html.indexOf('class="tsumugu-skip"');
    const main = html.indexOf("<main");

    expect(skip).toBeGreaterThan(-1);
    expect(skip).toBeLessThan(main);
    expect(html).toContain('href="#tsumugu-content"');
    expect(html).toContain('id="tsumugu-content"');
  });

  it("identifies the current page to assistive technology, not only by colour", () => {
    expect(shell()).toContain('<a aria-current="page" href="/guide/setup">');
  });

  it("does not mark any other entry as current", () => {
    const html = shell();

    // Once in the markup; the page client's scrollspy code mentions the
    // attribute too, so the count is over aria-current="page" specifically.
    expect(html.match(/aria-current="page"/gu)).toHaveLength(1);
  });

  it("links every navigation entry", () => {
    const html = shell();

    expect(html).toContain('href="/"');
    expect(html).toContain('href="/guide"');
  });

  it("renders a directory without an index document as a label rather than a link", () => {
    const withGroup = buildNavigation([
      navigationDocument("guide/setup.md", "/guide/setup", "Setup"),
    ]);
    const html = shell({ navigation: withGroup.items });

    expect(html).toContain('<span class="tsumugu-nav-group">Guide</span>');
  });

  it("percent-encodes a route that needs it", () => {
    const spaced = buildNavigation([
      navigationDocument("a page.md", "/a page", "A page"),
    ]);

    expect(shell({ navigation: spaced.items })).toContain('href="/a%20page"');
  });

  it("links the table of contents to heading identifiers", () => {
    expect(shell()).toContain('<a href="#install">Install</a>');
  });

  it("omits the table of contents when a page has no sections", () => {
    const html = shell({ tableOfContents: [] });

    expect(html).not.toContain("On this page");
    // An empty navigation landmark is announced as navigation containing
    // nothing, which costs the reader who can least afford it.
    expect(html.match(/<nav/gu)).toHaveLength(1);
  });

  it("omits the sidebar when a project has no navigation", () => {
    const html = shell({ navigation: [], tableOfContents: [] });

    expect(html).not.toContain("<nav");
    expect(html).toContain("<main");
  });

  it("shows the page's problems on the page", () => {
    const html = shell({
      diagnostics: [
        {
          code: "theme/missing-renderer",
          severity: "warning",
          message: "Something was not rendered.",
          hint: "Its content is still shown.",
        },
      ],
    });

    expect(html).toContain("1 problem with this document");
    expect(html).toContain("Something was not rendered.");
    expect(html).toContain("Its content is still shown.");
    // Severity as text, because a colour alone is not a message.
    expect(html).toContain(">warning<");
  });

  it("says nothing about problems when there are none", () => {
    expect(shell()).not.toContain("tsumugu-diagnostics");
  });

  it("names the page before the site, so a narrow browser tab stays useful", () => {
    const result = renderShell({
      siteName: "Docs",
      title: "Setup",
      currentRoute: "/guide/setup" as RoutePath,
      navigation: navigation.items,
      tableOfContents: [],
      content: element("p", {}, text("x")),
      diagnostics: [],
    });

    expect(result.documentTitle).toBe("Setup · Docs");
  });

  it("does not repeat the site name when a page is the site", () => {
    const result = renderShell({
      siteName: "Docs",
      title: "Docs",
      currentRoute: "/" as RoutePath,
      navigation: [],
      tableOfContents: [],
      content: element("p", {}, text("x")),
      diagnostics: [],
    });

    expect(result.documentTitle).toBe("Docs");
  });

  it("places the shell stylesheet and then the theme's in the head", () => {
    const result = renderShell({
      siteName: "Docs",
      title: "Setup",
      description: "How to set it up",
      currentRoute: "/" as RoutePath,
      navigation: [],
      tableOfContents: [],
      content: element("p", {}, text("x")),
      diagnostics: [],
      themeStylesheet: ".tsumugu-doc { color: rebeccapurple }",
    });

    const head = serializeToHtml(result.head);
    expect(head).toContain(
      '<meta content="How to set it up" name="description">',
    );
    expect(head.indexOf(".tsumugu-shell")).toBeLessThan(
      head.indexOf("rebeccapurple"),
    );
  });

  it("tells the browser both schemes are supported", () => {
    const result = renderShell({
      siteName: "Docs",
      title: "Setup",
      currentRoute: "/" as RoutePath,
      navigation: [],
      tableOfContents: [],
      content: element("p", {}, text("x")),
      diagnostics: [],
    });

    const head = serializeToHtml(result.head);
    expect(head).toContain('media="(prefers-color-scheme: dark)"');
    expect(head).toContain('media="(prefers-color-scheme: light)"');
  });

  it("carries exactly the one page client, and nothing that needs it", () => {
    const html = shell();

    // One script — the page client, allowed by its hash — and a page that
    // reads, navigates and searches (via /search) without it.
    expect(html.match(/<script/gu)).toHaveLength(1);
    // The copy control is created by the script, not server-rendered: a
    // button that does nothing without JavaScript is worse than no button.
    expect(html).not.toContain("<button");
  });
});
