import type { LoadedDocument, RenderResult, Renderer } from "tsumugu-core";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { frontmatter } from "micromark-extension-frontmatter";
import { gfmTable } from "micromark-extension-gfm-table";

import { convertToSemanticAst } from "./convert.js";
import { readFrontMatter } from "./frontmatter.js";

/**
 * The Markdown renderer.
 *
 * Everything specific to the parser lives in this package. Core and themes see
 * only the Semantic AST, so the parser can be replaced without either of them
 * changing — which is what makes "HTML is a first-class input" possible rather
 * than aspirational.
 *
 * ## Supported dialect
 *
 * **CommonMark**, plus exactly two intentional extensions:
 *
 * - **GFM tables**, because documentation has tables and CommonMark has none.
 * - **YAML front matter**, because documents need metadata and CommonMark has
 *   no syntax for it.
 *
 * Nothing else. No custom directives, no proprietary syntax, no presentation
 * features invented for Tsumugu — a document must stay readable in any Markdown
 * tool, which is what "plain files forever" means when it is taken seriously.
 *
 * Anything the Semantic AST cannot yet represent — hard line breaks,
 * reference-style definitions — becomes an `unsupported` node keeping the
 * author's source, plus a warning. A gap in Tsumugu is not a mistake by the
 * author, and their text is not Tsumugu's to discard.
 */

export interface MarkdownRendererOptions {
  /**
   * Identifier for this renderer instance.
   *
   * Only worth setting when two Markdown renderers are registered with
   * different options, which selection would otherwise reject as ambiguous.
   */
  readonly id?: string;
}

/**
 * Builds a Markdown renderer.
 *
 * Options are held here rather than passed through core, so core never learns
 * what a Markdown setting is.
 */
export function createMarkdownRenderer(
  options: MarkdownRendererOptions = {},
): Renderer {
  const id = options.id ?? "markdown";

  return {
    id,

    supports: (document: LoadedDocument): boolean =>
      document.format === "markdown",

    render: (document: LoadedDocument): RenderResult => {
      const tree = fromMarkdown(document.content, {
        extensions: [gfmTable(), frontmatter(["yaml"])],
        mdastExtensions: [
          gfmTableFromMarkdown(),
          frontmatterFromMarkdown(["yaml"]),
        ],
      });

      const frontMatterNode = tree.children.find(
        (node) => node.type === "yaml",
      );
      const frontMatter =
        frontMatterNode === undefined
          ? { entries: [], diagnostics: [] }
          : readFrontMatter(frontMatterNode.value, document.sourcePath);

      const converted = convertToSemanticAst(
        tree,
        document.sourcePath,
        document.content,
      );

      return {
        root: converted.root,
        diagnostics: [...frontMatter.diagnostics, ...converted.diagnostics],
        metadata: frontMatter.entries,
      };
    },
  };
}
