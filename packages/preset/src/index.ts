import {
  createHeadingIdTransformer,
  type Renderer,
  type Theme,
  type Transformer,
} from "tsumugu-core";
import { createHtmlRenderer } from "tsumugu-renderer-html";
import { createMarkdownRenderer } from "tsumugu-renderer-markdown";
import { defaultTheme } from "tsumugu-theme-default";
import { createHighlightTransformer } from "tsumugu-transformer-highlight";
import { createMermaidTransformer } from "tsumugu-transformer-mermaid";

/**
 * The official composition.
 *
 * "Zero configuration" is a promise about what a user has to do, not a claim
 * that nothing was decided. Every decision is here, in one list, and this
 * module is the whole of it: which formats are understood, what happens to a
 * document between parsing and presentation, and what it looks like.
 *
 * It is an ordinary function returning ordinary values. There is no plugin
 * discovery, nothing is read from `node_modules`, and nothing here can be
 * changed by a package that happens to be installed. A project that wants
 * something different calls this and edits the result, or does not call it at
 * all — which is the difference between a default and a policy.
 *
 * ## What the default composition includes
 *
 * | Stage | Registered | Why |
 * | --- | --- | --- |
 * | renderer | `tsumugu-renderer-markdown` | Markdown is what most documentation is written in |
 * | renderer | `tsumugu-renderer-html` | HTML is a first-class source, not only an output |
 * | transformer | heading identifiers | an anchor is a link people share; every page needs them |
 * | transformer | `tsumugu-transformer-mermaid` | a fenced diagram is a diagram, and drawing it costs no dependency |
 * | transformer | syntax highlighting | documentation contains code, and unhighlighted code is harder to read |
 * | theme | `tsumugu-theme-default` | a zero-config tool has to produce something readable without CSS |
 *
 * ## Order
 *
 * Renderers are tried in registration order; Markdown comes first because it is
 * the common case, and the two never claim the same document anyway.
 *
 * Transformers run in registration order, and here the order carries meaning:
 * identifiers are resolved **before** highlighting, so a heading is addressable
 * whatever a later transformer does to the document, and diagrams are drawn
 * **before** highlighting so the highlighter never colours a block that stopped
 * being code. A transformer added by a
 * caller runs after both unless the caller says otherwise.
 */

export interface PresetOptions {
  /**
   * Replaces the renderers entirely.
   *
   * A project serving only Markdown passes `[createMarkdownRenderer()]`, and
   * one adding a format passes the official two plus its own.
   */
  readonly renderers?: readonly Renderer[];
  /** Replaces the transformers entirely. Pass `[]` for none. */
  readonly transformers?: readonly Transformer[];
  /** Replaces the theme. */
  readonly theme?: Theme;
  /**
   * The operator's declaration that the root's content is theirs and may run
   * as code (ADR 7).
   *
   * With it, the default renderers emit preserved markup as written, keep
   * `<script>` elements, and report each inline script's text instead of
   * removing them. It only shapes the defaults: a caller replacing
   * `renderers` decides all of that in the renderers they pass.
   */
  readonly trust?: boolean;
  /**
   * An executing MDX renderer to place ahead of the default renderers
   * (ADR 7, third phase).
   *
   * A slot rather than an import, so this package never depends on the
   * execution toolchain — the caller who owns the trust decision brings the
   * renderer that acts on it. With it, the default Markdown renderer declines
   * `.mdx`; without it, ADR 6 rendering stands.
   *
   * Only honored alongside `trust`: executing a document is the declaration,
   * so a composition that has not made it does not get an executing renderer
   * through a second option. Ignored when `renderers` replaces the
   * composition outright.
   */
  readonly mdx?: Renderer;
}

export interface Preset {
  readonly renderers: readonly Renderer[];
  readonly transformers: readonly Transformer[];
  readonly theme: Theme;
}

/**
 * Builds the official composition, with anything the caller replaced.
 *
 * The result is a plain object, so a caller that wants "the defaults, plus
 * one more transformer" writes exactly that:
 *
 * ```ts
 * const preset = createPreset();
 * const site = await createSite({
 *   root,
 *   ...preset,
 *   transformers: [...preset.transformers, myTransformer],
 * });
 * ```
 *
 * Nothing is hidden behind an option for that case, because spreading an array
 * is already the clearest way to say it.
 */
function defaultRenderers(options: PresetOptions): readonly Renderer[] {
  const trust = options.trust === true;
  const mdx = trust ? options.mdx : undefined;

  const markdown = createMarkdownRenderer({
    ...(trust ? { trust } : {}),
    ...(mdx === undefined ? {} : { mdx: "decline" as const }),
  });
  const html = createHtmlRenderer(trust ? { trust } : {});

  return mdx === undefined ? [markdown, html] : [mdx, markdown, html];
}

export function createPreset(options: PresetOptions = {}): Preset {
  return {
    renderers: options.renderers ?? defaultRenderers(options),
    transformers: options.transformers ?? [
      createHeadingIdTransformer(),
      createMermaidTransformer(),
      createHighlightTransformer(),
    ],
    theme: options.theme ?? defaultTheme,
  };
}

/**
 * The identifiers the default composition registers, in order.
 *
 * Exported so a test can state what "zero configuration" currently means and
 * fail when it silently changes. A default that can drift without anyone
 * noticing is not a default, it is a surprise waiting to happen.
 */
export const officialComposition = {
  renderers: ["markdown", "html"],
  transformers: [
    "tsumugu:heading-ids",
    "tsumugu:mermaid",
    "tsumugu:syntax-highlight",
  ],
  theme: "default",
} as const;
