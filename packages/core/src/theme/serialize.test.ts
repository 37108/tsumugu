import { describe, expect, it } from "vitest";

import {
  escapeAttribute,
  escapeText,
  serialize,
  serializeDocument,
  serializeToHtml,
  serializerCodes,
} from "./serialize.js";
import {
  element,
  fragment,
  text,
  trustedHtml,
  type VirtualNode,
} from "./virtual-tree.js";

describe("escaping text", () => {
  it("neutralises every character that could start markup", () => {
    expect(escapeText("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("escapes the ampersand first, so escapes are not re-escaped", () => {
    expect(escapeText("&lt;")).toBe("&amp;lt;");
    expect(escapeText("a & b < c")).toBe("a &amp; b &lt; c");
  });

  it("escapes quotes in text as well as in attributes", () => {
    // Costs four bytes and removes a whole class of "this string was later
    // moved into an attribute" bug.
    expect(escapeText(`he said "hi" and 'bye'`)).toBe(
      "he said &quot;hi&quot; and &#39;bye&#39;",
    );
  });

  it("uses the same rules for attributes", () => {
    // Two escaping functions become two sets of rules, and the one used less
    // often is the one that is wrong.
    for (const value of ['<a href="x">', "a & b", "'", "é"]) {
      expect(escapeAttribute(value)).toBe(escapeText(value));
    }
  });

  it("leaves Unicode alone", () => {
    expect(escapeText("ガイド — naïve 🎉")).toBe("ガイド — naïve 🎉");
  });

  it("handles an empty string", () => {
    expect(escapeText("")).toBe("");
  });
});

describe("text cannot inject HTML", () => {
  it.each([
    ["a script tag", "<script>alert(1)</script>"],
    ["an attribute break-out", '" onerror="alert(1)'],
    ["a tag close", "</p><script>x</script>"],
    ["an entity", "&amp;"],
  ])("neutralises %s in text content", (_label, payload) => {
    const html = serializeToHtml(element("p", {}, payload));

    // The property is that the payload appears escaped and only escaped, not
    // that any particular entity shows up: "&amp;" contains no angle bracket.
    expect(html).toBe(`<p>${escapeText(payload)}</p>`);
    expect(html).not.toContain("<script");
    expect(html).not.toContain('onerror="');
  });

  it("neutralises a break-out attempt in an attribute value", () => {
    const html = serializeToHtml(
      element("img", { src: "x", alt: '" onerror="alert(1)' }),
    );

    // The quote is escaped, so the attribute cannot end early.
    expect(html).toBe('<img alt="&quot; onerror=&quot;alert(1)" src="x">');
    expect(html).not.toContain('onerror="alert');
  });
});

describe("elements", () => {
  it("serializes nested elements", () => {
    expect(
      serializeToHtml(
        element("article", { class: "page" }, element("h1", {}, "Title")),
      ),
    ).toBe('<article class="page"><h1>Title</h1></article>');
  });

  it("emits an element with no children as an empty pair", () => {
    expect(serializeToHtml(element("div"))).toBe("<div></div>");
  });

  it("emits a bare boolean attribute", () => {
    expect(serializeToHtml(element("details", { open: true }))).toBe(
      "<details open></details>",
    );
  });

  it("emits an empty attribute value as empty quotes", () => {
    // An empty alt is meaningful: it marks an image decorative.
    expect(serializeToHtml(element("img", { alt: "", src: "/a.png" }))).toBe(
      '<img alt="" src="/a.png">',
    );
  });

  it("orders attributes deterministically", () => {
    const forwards = serializeToHtml(
      element("a", { href: "/", id: "x", role: "link" }),
    );
    const backwards = serializeToHtml(
      element("a", { role: "link", href: "/", id: "x" }),
    );

    expect(backwards).toBe(forwards);
    expect(forwards).toBe('<a href="/" id="x" role="link"></a>');
  });
});

describe("void elements", () => {
  it.each(["br", "hr", "img", "input", "meta", "link", "source", "wbr"])(
    "emits %s with no closing tag",
    (tag) => {
      const html = serializeToHtml(element(tag));

      expect(html).toBe(`<${tag}>`);
      expect(html).not.toContain(`</${tag}>`);
    },
  );

  it("drops children of a void element rather than emitting invalid markup", () => {
    // A void element cannot contain anything, and pretending otherwise
    // produces markup the browser reinterprets in its own way.
    expect(serializeToHtml(element("br", {}, "ignored"))).toBe("<br>");
  });

  it("keeps attributes on a void element", () => {
    expect(serializeToHtml(element("img", { alt: "A", src: "/a.png" }))).toBe(
      '<img alt="A" src="/a.png">',
    );
  });
});

describe("raw-text elements", () => {
  it.each(["script", "style", "textarea", "iframe"])(
    "refuses to place text inside %s",
    (tag) => {
      // Escaping would corrupt the content; not escaping would let it close the
      // element. Neither is acceptable, so the content is dropped.
      const html = serializeToHtml(element(tag, {}, "</" + tag + "><b>x</b>"));

      expect(html).toBe(`<${tag}></${tag}>`);
    },
  );

  it("still emits attributes on them", () => {
    expect(serializeToHtml(element("script", { src: "/a.js" }))).toBe(
      '<script src="/a.js"></script>',
    );
  });

  it("emits trusted content, which is how a theme ships a stylesheet", () => {
    const css = "main > p { color: #000 }";

    expect(
      serializeToHtml(
        element("style", {}, trustedHtml(css, "the theme's own stylesheet")),
      ),
    ).toBe(`<style>${css}</style>`);
  });

  it("drops trusted content that would close the element", () => {
    // The one thing raw text cannot express is its own end tag, so content
    // containing it is dropped rather than allowed to escape the element.
    expect(
      serializeToHtml(
        element(
          "style",
          {},
          trustedHtml("a{}</style><script>x</script>", "claimed to be trusted"),
        ),
      ),
    ).toBe("<style></style>");
  });

  it("drops trusted content mixed with ordinary text", () => {
    expect(
      serializeToHtml(
        element("style", {}, trustedHtml("a{}", "trusted"), "b{}"),
      ),
    ).toBe("<style></style>");
  });
});

describe("fragments", () => {
  it("emits children with no wrapper", () => {
    expect(
      serializeToHtml(fragment(element("p", {}, "a"), element("p", {}, "b"))),
    ).toBe("<p>a</p><p>b</p>");
  });

  it("emits nothing for an empty fragment", () => {
    expect(serializeToHtml(fragment())).toBe("");
  });

  it("flattens nested fragments", () => {
    expect(serializeToHtml(fragment("a", fragment("b", fragment("c"))))).toBe(
      "abc",
    );
  });
});

describe("trusted raw HTML", () => {
  it("is the only path to unescaped output", () => {
    const raw = serializeToHtml(
      trustedHtml("<hr class='rule'>", "theme markup, no user input"),
    );
    const escaped = serializeToHtml(text("<hr class='rule'>"));

    expect(raw).toBe("<hr class='rule'>");
    expect(escaped).not.toContain("<hr");
  });

  it("passes through inside an element", () => {
    expect(
      serializeToHtml(
        element("div", {}, trustedHtml("<b>bold</b>", "theme markup")),
      ),
    ).toBe("<div><b>bold</b></div>");
  });

  it("does not sanitize; the trust decision was made before this point", () => {
    // Stated as a test so the boundary is explicit: the serializer honours the
    // decision, it does not second-guess it.
    expect(
      serializeToHtml(trustedHtml("<script>x</script>", "deliberate")),
    ).toBe("<script>x</script>");
  });
});

describe("invalid nodes", () => {
  it("reports a diagnostic instead of emitting broken markup", () => {
    // Emitting a broken tag and hoping the browser recovers is how a page ends
    // up with somebody else's markup in it.
    const result = serialize(element("bad tag", {}, "content"));

    expect(result.html).toBe("");
    expect(result.diagnostics[0]?.code).toBe(serializerCodes.invalidNode);
    expect(result.diagnostics[0]?.severity).toBe("error");
    expect(result.diagnostics[0]?.stage).toBe("serializer");
  });

  it("skips only the invalid element, keeping the rest of the page", () => {
    const result = serialize(
      element("main", {}, element("p", {}, "kept"), element("bad tag")),
    );

    expect(result.html).toContain("kept");
    expect(result.html).not.toContain("bad tag");
    expect(result.diagnostics).toHaveLength(1);
  });

  it("skips an element with an attribute name that could break out", () => {
    const result = serialize(element("div", { 'x" onload="y': "1" }));

    expect(result.html).toBe("");
    expect(result.diagnostics).toHaveLength(1);
  });

  it("reports nothing for a valid tree", () => {
    expect(serialize(element("p", {}, "fine")).diagnostics).toEqual([]);
  });
});

describe("determinism", () => {
  it("produces identical bytes for equivalent trees", () => {
    const build = (): VirtualNode =>
      element(
        "article",
        { id: "a", class: "b" },
        element("h1", {}, "Title"),
        fragment(element("p", {}, "One"), element("p", {}, "Two")),
      );

    expect(serializeToHtml(build())).toBe(serializeToHtml(build()));
  });

  it("adds no whitespace of its own", () => {
    // Whitespace is significant between inline elements, so pretty-printing
    // would change what the browser renders.
    expect(
      serializeToHtml(
        element("p", {}, element("em", {}, "a"), element("em", {}, "b")),
      ),
    ).toBe("<p><em>a</em><em>b</em></p>");
  });
});

describe("serializeDocument", () => {
  it("wraps a body in a complete document", () => {
    const result = serializeDocument(element("main", {}, "Body"), {
      lang: "en",
      title: "A page",
    });

    expect(result.html).toBe(
      "<!doctype html>" +
        '<html lang="en">' +
        "<head>" +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        "<title>A page</title>" +
        "</head>" +
        "<body><main>Body</main></body>" +
        "</html>",
    );
  });

  it("escapes the title", () => {
    // <title> is a raw-text element the tree refuses to fill, so this is the
    // one place that knows the exception - and it escapes.
    const result = serializeDocument(element("main"), {
      lang: "en",
      title: "</title><script>alert(1)</script>",
    });

    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;/title&gt;");
  });

  it("escapes the language attribute", () => {
    const result = serializeDocument(element("main"), {
      lang: '"><script>x</script>',
      title: "t",
    });

    expect(result.html).not.toContain("<script>");
  });

  it("places extra head content after the title", () => {
    const result = serializeDocument(element("main"), {
      lang: "en",
      title: "t",
      head: element("meta", { content: "A page", name: "description" }),
    });

    expect(result.html).toContain(
      '<title>t</title><meta content="A page" name="description">',
    );
  });

  it("collects diagnostics from the body and the head", () => {
    const result = serializeDocument(element("bad tag"), {
      lang: "en",
      title: "t",
      head: element("also bad"),
    });

    expect(result.diagnostics).toHaveLength(2);
  });
});
