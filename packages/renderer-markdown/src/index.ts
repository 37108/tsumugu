import type { LoadedDocument, RenderResult, Renderer } from "tsumugu-core";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { mdxFromMarkdown } from "mdast-util-mdx";
import { frontmatter } from "micromark-extension-frontmatter";
import { gfmTable } from "micromark-extension-gfm-table";
import { mdxjs } from "micromark-extension-mdxjs";

import { convertToSemanticAst, type ScriptMode } from "./convert.js";

export type { ScriptMode } from "./convert.js";
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
 * **CommonMark**, plus three intentional extensions:
 *
 * - **GFM tables**, because documentation has tables and CommonMark has none.
 * - **GFM task lists**, because checklists are common in operational guides.
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
  /**
   * What happens to `<script>` inside embedded HTML. Markdown always carries
   * embedded HTML as preserved raw markup; `"preserve"` — for a composition
   * the operator declared trusted (ADR 7) — additionally reports each inline
   * script's text so the server can allow exactly those by hash. This
   * renderer never decides trust; it is built into a composition that did.
   */
  readonly scripts?: ScriptMode;
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
      document.format === "markdown" || document.format === "mdx",

    render: (document: LoadedDocument): RenderResult => {
      // MDX is Markdown with three more kinds of node — expressions, JSX and
      // ESM — and all three are handled by *not executing them*: the converter
      // preserves each as escaped source with a diagnostic naming the policy.
      // That is what lets .mdx into the default composition without touching
      // the trust model. docs/decisions/0006-mdx-without-execution.md is the
      // argument in full.
      const isMdx = document.format === "mdx";
      const tree = fromMarkdown(document.content, {
        extensions: [
          gfmTable(),
          frontmatter(["yaml"]),
          ...(isMdx ? [mdxjs()] : []),
        ],
        mdastExtensions: [
          gfmTableFromMarkdown(),
          frontmatterFromMarkdown(["yaml"]),
          ...(isMdx ? [mdxFromMarkdown()] : []),
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
        options.scripts ?? "remove",
      );

      return {
        root: converted.root,
        diagnostics: [...frontMatter.diagnostics, ...converted.diagnostics],
        metadata: frontMatter.entries,
        ...(converted.scripts.length === 0
          ? {}
          : { scripts: converted.scripts }),
      };
    },
  };
}
