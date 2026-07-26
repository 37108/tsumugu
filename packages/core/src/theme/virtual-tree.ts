/**
 * The Virtual Tree.
 *
 * A theme has to describe HTML. Building strings by hand is how escaping bugs
 * happen, and reaching for React or a JSX runtime would make a documentation
 * server depend on a UI framework in order to emit static markup.
 *
 * So there is a small tree instead. Four node types, no state, no effects, no
 * reconciliation, no events, no lifecycle. It exists to be serialized once, on
 * a server, and it is deliberately small enough to read in one sitting.
 *
 * The safety property that matters: **text is escaped and raw HTML is not, and
 * the two are different types.** A theme cannot produce unescaped output by
 * forgetting something. It has to ask for it, in a call that requires a reason.
 */

/**
 * A value an attribute can hold before normalization.
 *
 * `false`, `null` and `undefined` all mean "omit this attribute", so a theme
 * can write `{ hidden: isDraft }` without branching.
 */
export type AttributeValue = string | number | boolean | null | undefined;

/** Attributes after normalization: present ones only. */
export type NormalizedAttributes = Readonly<Record<string, string | true>>;

export interface VirtualElement {
  readonly type: "element";
  readonly tag: string;
  readonly attributes: NormalizedAttributes;
  readonly children: readonly VirtualNode[];
}

/**
 * Literal text.
 *
 * Escaped when serialized. This is the only way to emit content, unless a
 * caller deliberately asks otherwise.
 */
export interface VirtualText {
  readonly type: "text";
  readonly value: string;
}

/** Several nodes with no element wrapping them. */
export interface VirtualFragment {
  readonly type: "fragment";
  readonly children: readonly VirtualNode[];
}

/**
 * HTML emitted verbatim.
 *
 * Named for what it is rather than for what it is used for, so that it is
 * obvious in a diff. Every construction records **why** the content is
 * trustworthy, because a reviewer's real question is never "is this raw" but
 * "who decided this was safe".
 */
export interface TrustedHtml {
  readonly type: "trusted-html";
  readonly html: string;
  /** Why this content may bypass escaping. Recorded, never rendered. */
  readonly reason: string;
}

export type VirtualNode =
  VirtualElement | VirtualText | VirtualFragment | TrustedHtml;

/**
 * What a theme may pass as a child.
 *
 * Strings and numbers become text, so the ordinary case needs no ceremony.
 * `null`, `undefined` and `false` are dropped, so a conditional child can be
 * written inline. Arrays are flattened, so a mapped list needs no spread.
 */
export type VirtualChild =
  | VirtualNode
  | string
  | number
  | null
  | undefined
  | boolean
  | readonly VirtualChild[];

/**
 * Normalizes children.
 *
 * `true` is dropped along with `false`: it only ever arrives from a mistyped
 * conditional, and rendering the word "true" into a page helps nobody.
 */
export function normalizeChildren(
  children: readonly VirtualChild[],
): VirtualNode[] {
  const normalized: VirtualNode[] = [];

  for (const child of children) {
    if (child === null || child === undefined || typeof child === "boolean") {
      continue;
    }
    if (typeof child === "string") {
      // Empty strings would serialize to nothing; dropping them keeps trees
      // comparable in tests.
      if (child !== "") {
        normalized.push({ type: "text", value: child });
      }
      continue;
    }
    if (typeof child === "number") {
      normalized.push({ type: "text", value: String(child) });
      continue;
    }
    if (Array.isArray(child)) {
      normalized.push(...normalizeChildren(child));
      continue;
    }
    normalized.push(child as VirtualNode);
  }

  return normalized;
}

/**
 * Normalizes attributes.
 *
 * `false`, `null` and `undefined` remove an attribute entirely rather than
 * emitting `hidden="false"`, which HTML reads as hidden. `true` becomes a bare
 * boolean attribute. Numbers become strings, because HTML has only strings.
 */
export function normalizeAttributes(
  attributes: Readonly<Record<string, AttributeValue>>,
): NormalizedAttributes {
  const normalized: Record<string, string | true> = {};

  // Sorted, so the same tree always serializes to the same bytes. Attribute
  // order carries no meaning in HTML, and unstable order makes output
  // undiffable and caching by content hash useless.
  for (const name of Object.keys(attributes).sort()) {
    const value = attributes[name];
    if (value === false || value === null || value === undefined) {
      continue;
    }
    normalized[name] = value === true ? true : String(value);
  }

  return normalized;
}

/** Builds an element. */
export function element(
  tag: string,
  attributes: Readonly<Record<string, AttributeValue>> = {},
  ...children: readonly VirtualChild[]
): VirtualElement {
  return {
    type: "element",
    tag,
    attributes: normalizeAttributes(attributes),
    children: normalizeChildren(children),
  };
}

/** Builds escaped text. */
export function text(value: string): VirtualText {
  return { type: "text", value };
}

/** Builds a fragment. */
export function fragment(
  ...children: readonly VirtualChild[]
): VirtualFragment {
  return { type: "fragment", children: normalizeChildren(children) };
}

/**
 * Builds a node whose HTML is emitted verbatim.
 *
 * Deliberately awkward. The `reason` is required and unused at runtime; its
 * only job is to make the author state who decided this content is safe, and
 * to put that statement in front of a reviewer.
 *
 * Documentation-authored HTML is **not** automatically eligible. Preserved
 * source arrives as an untrusted AST node, and whether any of it reaches the
 * page is the serializer's decision under the security policy — not something
 * a theme may assume by calling this.
 */
export function trustedHtml(html: string, reason: string): TrustedHtml {
  return { type: "trusted-html", html, reason };
}

export interface VirtualNodeProblem {
  readonly path: string;
  readonly message: string;
}

/** Tag names HTML allows: a letter, then letters, digits or hyphens. */
const tagPattern = /^[a-z][a-z0-9-]*$/;

/**
 * Attribute names that cannot break out of an attribute list.
 *
 * Anything containing whitespace, a quote, `=`, `/`, `>` or `<` could end the
 * attribute early and start something else. This is the narrow allowlist
 * rather than a blocklist, because a blocklist here is a list of the injection
 * techniques somebody has thought of so far.
 */
const attributePattern = /^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/;

function describe(trail: readonly string[], node: VirtualNode): string {
  const own = node.type === "element" ? node.tag : node.type;
  return [...trail, own].join(" > ");
}

/**
 * Reports structural problems the type system cannot express.
 *
 * A theme assembles nodes from data, so a tag name or attribute name can be
 * computed at runtime — and a computed attribute name is where markup
 * injection would enter if it were not checked. This runs in development and
 * in tests.
 */
export function findVirtualNodeProblems(
  root: VirtualNode,
): VirtualNodeProblem[] {
  const problems: VirtualNodeProblem[] = [];

  const walk = (node: VirtualNode, trail: readonly string[]): void => {
    const path = describe(trail, node);
    const at = (message: string): void => {
      problems.push({ path, message });
    };

    switch (node.type) {
      case "element": {
        if (!tagPattern.test(node.tag)) {
          at(
            `"${node.tag}" is not a valid element name. A tag is a letter followed by letters, digits or hyphens.`,
          );
        }
        for (const name of Object.keys(node.attributes)) {
          if (!attributePattern.test(name)) {
            at(
              `"${name}" is not a valid attribute name. A name containing whitespace, a quote or an angle bracket could end the attribute early and inject markup.`,
            );
          }
        }
        for (const child of node.children) {
          walk(child, [...trail, node.tag]);
        }
        break;
      }

      case "fragment":
        for (const child of node.children) {
          walk(child, [...trail, "fragment"]);
        }
        break;

      case "text":
        if (typeof node.value !== "string") {
          at("Text must be a string.");
        }
        break;

      case "trusted-html":
        if (node.reason.trim() === "") {
          at(
            "Trusted HTML must record why it is trusted. The reason is what a reviewer reads before deciding whether to believe it.",
          );
        }
        break;
    }
  };

  walk(root, []);
  return problems;
}

/** Whether a tree satisfies every structural invariant. */
export function isValidVirtualNode(root: VirtualNode): boolean {
  return findVirtualNodeProblems(root).length === 0;
}
