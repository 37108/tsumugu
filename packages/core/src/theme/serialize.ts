import type { DocumentDiagnostic } from "../document/diagnostics.js";
import { findVirtualNodeProblems, type VirtualNode } from "./virtual-tree.js";

/**
 * HTML serialization.
 *
 * This is the last place anything can be made safe. Everything upstream decides
 * what a page means; this decides what bytes reach the browser, so an escaping
 * mistake here is a cross-site scripting bug no matter how careful every other
 * stage was.
 *
 * It is deliberately small, has no dependencies, and does not use the browser's
 * DOM. Server output must be byte-identical across platforms and Node versions
 * for caching, diffing and future static builds to work at all.
 */

export const serializerCodes = {
  invalidNode: "serializer/invalid-node",
} as const;

/**
 * Elements with no closing tag.
 *
 * From the HTML specification. Emitting `<br></br>` produces two line breaks in
 * some parsers and one in others, so the list is not optional.
 */
const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/**
 * Elements whose content is raw text.
 *
 * Their children cannot be escaped — an escaped `<` inside a `<script>` is the
 * literal characters `&lt;`, not a less-than sign — so escaping would silently
 * corrupt them, and *not* escaping would let content close the element and
 * start executing. Neither is acceptable, so a theme may not put text in one:
 * the serializer refuses.
 */
const rawTextElements = new Set([
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
  "noscript",
  "noframes",
  "iframe",
  "plaintext",
]);

/**
 * Escapes text content.
 *
 * `&` first, or the escapes produced below would themselves be escaped.
 *
 * `<` and `>` prevent a tag from starting. `&` prevents an entity from being
 * fabricated. Quotes are escaped in text as well as in attributes: it costs
 * four bytes and removes a whole class of "this string was later moved into an
 * attribute" bug.
 */
export function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Escapes an attribute value.
 *
 * Identical to text escaping, and deliberately so. Two escaping functions
 * become two sets of rules, and the one used less often is the one that is
 * wrong.
 */
export function escapeAttribute(value: string): string {
  return escapeText(value);
}

export interface SerializeResult {
  readonly html: string;
  readonly diagnostics: readonly DocumentDiagnostic[];
}

/**
 * Serializes a Virtual Tree to HTML.
 *
 * Deterministic: the same tree always produces the same bytes. Attributes are
 * already sorted by the tree, and nothing here depends on iteration order, the
 * platform, or the clock.
 *
 * No whitespace is added. Pretty-printing would change what the browser renders
 * — whitespace is significant between inline elements — so output is compact
 * and readability is a job for whatever is displaying it.
 *
 * An invalid node produces a **diagnostic and no output for that node**, rather
 * than malformed HTML. Emitting a broken tag and hoping the browser recovers is
 * how a page ends up with an attacker's markup in it.
 */
export function serialize(root: VirtualNode): SerializeResult {
  const problems = findVirtualNodeProblems(root);
  const diagnostics: DocumentDiagnostic[] = problems.map((problem) => ({
    code: serializerCodes.invalidNode,
    severity: "error",
    stage: "serializer",
    message: `${problem.path}: ${problem.message}`,
    hint: "The node was skipped. Serializing it would have produced markup the browser has to guess at.",
  }));

  return { html: write(root, problems.length > 0), diagnostics };
}

/** Serializes a tree, ignoring diagnostics. For tests and callers that check first. */
export function serializeToHtml(root: VirtualNode): string {
  return serialize(root).html;
}

function write(node: VirtualNode, treeHasProblems: boolean): string {
  switch (node.type) {
    case "text":
      return escapeText(node.value);

    case "trusted-html":
      // The only path to unescaped output, reached only through a call that
      // required a reason. Whether the content deserved that trust was decided
      // before it got here.
      return node.html;

    case "fragment":
      return node.children
        .map((child) => write(child, treeHasProblems))
        .join("");

    case "element": {
      if (
        treeHasProblems &&
        !isSerializableElement(node.tag, node.attributes)
      ) {
        return "";
      }

      const attributes = Object.entries(node.attributes)
        .map(([name, value]) =>
          value === true ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`,
        )
        .join("");

      if (voidElements.has(node.tag)) {
        // No closing tag, and any children are dropped: a void element cannot
        // contain anything, and pretending otherwise produces markup the
        // browser reinterprets.
        return `<${node.tag}${attributes}>`;
      }

      if (rawTextElements.has(node.tag) && node.children.length > 0) {
        // Escaping would corrupt the content and not escaping would let it
        // close the element. A theme that needs one of these builds it with
        // trustedHtml, where the decision is visible.
        return `<${node.tag}${attributes}></${node.tag}>`;
      }

      const children = node.children
        .map((child) => write(child, treeHasProblems))
        .join("");
      return `<${node.tag}${attributes}>${children}</${node.tag}>`;
    }
  }
}

const tagPattern = /^[a-z][a-z0-9-]*$/;
const attributePattern = /^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/;

function isSerializableElement(
  tag: string,
  attributes: Readonly<Record<string, string | true>>,
): boolean {
  return (
    tagPattern.test(tag) &&
    Object.keys(attributes).every((name) => attributePattern.test(name))
  );
}

export interface DocumentOptions {
  readonly lang: string;
  readonly title: string;
  /** Nodes placed inside `<head>`, after the title. */
  readonly head?: VirtualNode;
}

/**
 * Wraps a body tree in a complete HTML document.
 *
 * The title is escaped here rather than being passed through the tree, because
 * `<title>` is a raw-text element and the tree deliberately refuses to put text
 * in one. This is the single place that knows the exception, and it escapes.
 */
export function serializeDocument(
  body: VirtualNode,
  options: DocumentOptions,
): SerializeResult {
  const bodyResult = serialize(body);
  const headResult =
    options.head === undefined
      ? { html: "", diagnostics: [] }
      : serialize(options.head);

  const html = [
    "<!doctype html>",
    `<html lang="${escapeAttribute(options.lang)}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(options.title)}</title>`,
    headResult.html,
    "</head>",
    "<body>",
    bodyResult.html,
    "</body>",
    "</html>",
  ].join("");

  return {
    html,
    diagnostics: [...bodyResult.diagnostics, ...headResult.diagnostics],
  };
}
