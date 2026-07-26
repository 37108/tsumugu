import type { LoadedDocument, RenderResult, Renderer } from "@tsumugu/core";
import type { Element, Nodes as HastNode, RootContent } from "hast";
import { fromHtml } from "hast-util-from-html";

import { convertToSemanticAst } from "./convert.js";

/**
 * The HTML renderer.
 *
 * HTML is a first-class source format, not an escape hatch inside Markdown.
 * A project with years of existing HTML documentation should be servable
 * without being rewritten, which is what "plain files forever" costs when it is
 * taken seriously.
 *
 * ## Trust model
 *
 * Everything in a documentation file is **content**, never application code.
 * That holds for `.html` files exactly as it does for HTML embedded in
 * Markdown. So:
 *
 * - Script content is **removed**, with one warning per document. JavaScript in
 *   documentation is disabled by default, and a future interactive mode needs
 *   an explicit isolated boundary rather than a quiet exception here.
 * - Elements with no semantic equivalent are **preserved as untrusted raw
 *   markup**. They are not dropped, because they are the author's content, and
 *   they are not trusted, because nobody has said they should be. What actually
 *   reaches the page is the serializer's decision under the security policy.
 * - Nothing is sanitized here. Sanitizing under an undefined threat model
 *   produces false confidence; the boundary is where output is written.
 */

export interface HtmlRendererOptions {
  /** Identifier for this renderer instance. */
  readonly id?: string;
}

/**
 * Whether the source looks like a complete document rather than a fragment.
 *
 * Detected from the source text, not from the parse tree: parsers *synthesize*
 * `html`, `head` and `body` for a fragment, so a tree-based check would call
 * everything a document. What distinguishes the two is what the author wrote.
 */
export function isFullDocument(source: string): boolean {
  return /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]/i.test(source);
}

function isElement(node: HastNode): node is Element {
  return node.type === "element";
}

function findElement(node: HastNode, tagName: string): Element | undefined {
  if (isElement(node) && node.tagName.toLowerCase() === tagName) {
    return node;
  }
  for (const child of "children" in node ? node.children : []) {
    const found = findElement(child, tagName);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function textOf(node: HastNode): string {
  if (node.type === "text") {
    return node.value;
  }
  return ("children" in node ? node.children : [])
    .map((child) => textOf(child))
    .join("");
}

/**
 * The part of a document that is its content.
 *
 * `<main>` first, then `<article>`, then `<body>`. A document that marks its
 * main content deserves to have that respected, and one that does not still
 * works. Everything outside the chosen element — a site header, a hand-written
 * sidebar — is not this document's content; core owns the shell.
 */
function contentOf(root: HastNode): readonly RootContent[] {
  for (const tag of ["main", "article", "body"]) {
    const found = findElement(root, tag);
    if (found !== undefined) {
      return found.children;
    }
  }
  return "children" in root ? root.children : [];
}

/**
 * Builds an HTML renderer.
 *
 * Options are held here rather than passed through core, so core never learns
 * what an HTML setting is.
 */
export function createHtmlRenderer(
  options: HtmlRendererOptions = {},
): Renderer {
  const id = options.id ?? "html";

  return {
    id,

    supports: (document: LoadedDocument): boolean => document.format === "html",

    render: (document: LoadedDocument): RenderResult => {
      const full = isFullDocument(document.content);

      const tree = fromHtml(document.content, {
        fragment: !full,
        // Positions are what let a diagnostic point at a line rather than at a
        // file.
        verbose: false,
      });

      const title = full
        ? textOf(
            findElement(tree, "title") ?? { type: "text", value: "" },
          ).trim()
        : "";

      const converted = convertToSemanticAst(
        full ? contentOf(tree) : tree.children,
        document.sourcePath,
        document.content,
      );

      return {
        root: {
          type: "document",
          children: converted.children,
        },
        diagnostics: converted.diagnostics,
        // Only a complete document has a title element. A fragment simply
        // contributes nothing at this level of the shared precedence, and the
        // chain moves on to the first heading.
        ...(title === "" ? {} : { htmlTitle: title }),
      };
    },
  };
}
