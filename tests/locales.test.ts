import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runBuild, startDev, type DevResult } from "tsumugu";

import {
  listFiles,
  withTemporaryDirectory,
  writeFiles,
} from "./helpers/temporary-directory.js";

let running: DevResult | undefined;

afterEach(async () => {
  await running?.server.close();
  running = undefined;
});

async function withLocalizedSite(
  run: (site: DevResult) => Promise<void>,
): Promise<void> {
  await withTemporaryDirectory(async (root) => {
    await writeFiles(root, {
      "index.md": "# Shared home\n\nRead the [Japanese guide](/ja/guide).\n",
      "greeting.md": "# Shared greeting\n",
      "ja/index.md": "# 日本語ホーム\n",
      "ja/guide.md":
        "# 日本語ガイド\n\n[English guide](/en/guide)\n\n![Shared image](/images/shared.txt)\n",
      "en/index.md": "# English home\n",
      "en/guide.md": "# English guide\n",
      "images/shared.txt": "shared asset",
    });
    running = await startDev({
      root,
      port: 0,
      watch: false,
      locales: ["ja", "en"],
      lang: "fr",
    });

    try {
      await run(running);
    } finally {
      await running.server.close();
      running = undefined;
    }
  });
}

describe("explicit locale scopes", () => {
  it("does not add language-of-parts markup without locale options", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "guide.md": "# Guide\n" });
      running = await startDev({ root, port: 0, watch: false });

      const html = await (await fetch(running.server.url)).text();
      expect(html).not.toContain('<p lang="en">');
      expect(/<a[^>]*class="tsumugu-skip"[^>]*lang=/u.test(html)).toBe(false);
    });
  });

  it("fails before startup when a locale directory is missing", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "ja/index.md": "# 日本語\n" });

      await expect(
        startDev({
          root,
          port: 0,
          watch: false,
          locales: ["ja", "en"],
        }),
      ).rejects.toThrow(`Locale "en" directory ${root}/en was not found.`);
    });
  });

  it("canonicalizes locale identifiers passed through the public API", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, { "en-US/index.md": "# American English\n" });

      running = await startDev({
        root,
        port: 0,
        watch: false,
        locales: ["en-us"],
      });

      const html = await (await fetch(`${running.server.url}en-US`)).text();
      expect(html).toContain('<html lang="en-US">');
      expect(html).toContain("American English");
    });
  });

  it("isolates shared and localized navigation while preserving routes", async () => {
    await withLocalizedSite(async ({ server }) => {
      const shared = await (await fetch(server.url)).text();
      const japanese = await (await fetch(`${server.url}ja`)).text();
      const english = await (await fetch(`${server.url}en`)).text();

      expect(shared).toContain('href="/greeting"');
      expect(shared).not.toContain("日本語ガイド");
      expect(shared).not.toContain("English guide");

      expect(japanese).toContain('href="/ja/guide"');
      expect(japanese).not.toContain("Shared greeting");
      expect(japanese).not.toContain("English guide");

      expect(english).toContain('href="/en/guide"');
      expect(english).not.toContain("Shared greeting");
      expect(english).not.toContain("日本語ガイド");
    });
  });

  it("validates cross-scope links and serves shared assets", async () => {
    await withLocalizedSite(async ({ server, site }) => {
      expect(site.result.diagnostics).toEqual([]);
      expect(await (await fetch(`${server.url}images/shared.txt`)).text()).toBe(
        "shared asset",
      );
    });
  });

  it("declares the shared language and each canonical locale", async () => {
    await withLocalizedSite(async ({ server }) => {
      expect(await (await fetch(server.url)).text()).toContain(
        '<html lang="fr">',
      );
      expect(await (await fetch(`${server.url}ja`)).text()).toContain(
        '<html lang="ja">',
      );
      expect(await (await fetch(`${server.url}en`)).text()).toContain(
        '<html lang="en">',
      );
    });
  });

  it("scopes search pages and search indexes", async () => {
    await withLocalizedSite(async ({ server }) => {
      const shared = (await (
        await fetch(`${server.url}search.json`)
      ).json()) as {
        readonly entries: readonly { readonly url: string }[];
      };
      const japanese = (await (
        await fetch(`${server.url}ja/search.json`)
      ).json()) as {
        readonly entries: readonly { readonly url: string }[];
      };
      const english = (await (
        await fetch(`${server.url}en/search.json`)
      ).json()) as {
        readonly entries: readonly { readonly url: string }[];
      };

      expect(shared.entries.map((entry) => entry.url)).toEqual([
        "/#shared-home",
        "/greeting#shared-greeting",
      ]);
      expect(japanese.entries.map((entry) => entry.url)).toEqual([
        "/ja#日本語ホーム",
        "/ja/guide#日本語ガイド",
      ]);
      expect(english.entries.map((entry) => entry.url)).toEqual([
        "/en#english-home",
        "/en/guide#english-guide",
      ]);

      const japanesePage = await (await fetch(`${server.url}ja/search`)).text();
      expect(japanesePage).toContain('action="/ja/search"');
      expect(japanesePage).toContain('content="/ja" name="tsumugu-base"');
      expect(japanesePage).toContain('href="/ja/guide"');
      expect(japanesePage).not.toContain("English guide");
    });
  });

  it("scopes document and language-model outputs but keeps one sitemap", async () => {
    await withLocalizedSite(async ({ server }) => {
      const routes = async (name: string): Promise<readonly string[]> => {
        const body = (await (await fetch(`${server.url}${name}`)).json()) as {
          readonly documents: readonly { readonly route: string }[];
        };
        return body.documents.map((document) => document.route);
      };

      expect(await routes("documents.json")).toEqual(["/", "/greeting"]);
      expect(await routes("ja/documents.json")).toEqual(["/ja", "/ja/guide"]);
      expect(await routes("en/documents.json")).toEqual(["/en", "/en/guide"]);

      const sharedLlms = await (await fetch(`${server.url}llms.txt`)).text();
      const japaneseLlms = await (
        await fetch(`${server.url}ja/llms.txt`)
      ).text();
      expect(sharedLlms).toContain("Shared greeting");
      expect(sharedLlms).not.toContain("日本語ガイド");
      expect(japaneseLlms).toContain("日本語ガイド");
      expect(japaneseLlms).not.toContain("Shared greeting");

      const sitemap = await (await fetch(`${server.url}sitemap.xml`)).text();
      for (const route of [
        "greeting",
        "search",
        "ja",
        "ja/guide",
        "ja/search",
        "en",
        "en/guide",
        "en/search",
      ]) {
        expect(sitemap).toContain(`<loc>${server.url}${route}</loc>`);
      }
    });
  });

  it("keeps not-found recovery inside the requested scope", async () => {
    await withLocalizedSite(async ({ server }) => {
      const japanese = await (await fetch(`${server.url}ja/missing`)).text();
      const shared = await (await fetch(`${server.url}missing`)).text();

      expect(japanese).toContain('<html lang="ja">');
      expect(japanese).toContain('href="/ja/guide"');
      expect(japanese).not.toContain("Shared greeting");
      expect(japanese).not.toContain("English guide");

      expect(shared).toContain('<html lang="fr">');
      expect(shared).toContain('href="/greeting"');
      expect(shared).not.toContain("日本語ガイド");
      expect(shared).not.toContain("English guide");
    });
  });

  it("generates a landing page for every scope without an index", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "greeting.md": "# Shared greeting\n",
        "ja/guide.md": "# 日本語ガイド\n",
      });
      await mkdir(path.join(root, "en"));
      await mkdir(path.join(root, "fr"));
      running = await startDev({
        root,
        port: 0,
        watch: false,
        locales: ["ja", "en", "fr"],
      });

      const shared = await (await fetch(running.server.url)).text();
      const japanese = await (await fetch(`${running.server.url}ja`)).text();
      const english = await (await fetch(`${running.server.url}en`)).text();
      const french = await (await fetch(`${running.server.url}fr`)).text();

      expect(shared).toContain('href="/greeting"');
      expect(shared).not.toContain("日本語ガイド");
      expect(japanese).toContain('href="/ja/guide"');
      expect(japanese).not.toContain("Shared greeting");
      expect(english).toContain("no documents yet");
      expect(english).toContain('<html lang="en">');
      expect(french).toContain('<html lang="fr">');
      expect(french).toContain('<p lang="en">');
      expect((await fetch(`${running.server.url}en/search`)).status).toBe(200);
    });
  });

  it("updates localized pages, navigation, search, and generated homes", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": "# Shared\n",
        "ja/index.md": "# 日本語\n",
      });
      running = await startDev({
        root,
        port: 0,
        watch: false,
        locales: ["ja"],
      });

      const guide = path.join(root, "ja", "guide.md");
      await writeFile(guide, "# 最初のガイド\n");
      await running.site.update();
      expect(await (await fetch(`${running.server.url}ja`)).text()).toContain(
        "最初のガイド",
      );
      expect(
        await (await fetch(`${running.server.url}ja/search.json`)).text(),
      ).toContain("最初のガイド");

      await writeFile(guide, "# 更新したガイド\n");
      await running.site.update();
      expect(
        await (await fetch(`${running.server.url}ja/guide`)).text(),
      ).toContain("更新したガイド");

      await rm(guide);
      await rm(path.join(root, "ja", "index.md"));
      await running.site.update();
      expect((await fetch(`${running.server.url}ja/guide`)).status).toBe(404);
      expect(await (await fetch(`${running.server.url}ja`)).text()).toContain(
        "no documents yet",
      );
      expect(
        await (await fetch(`${running.server.url}ja/search.json`)).text(),
      ).not.toContain("更新したガイド");
    });
  });

  it("writes the same scoped routes with a static base path", async () => {
    await withTemporaryDirectory(async (directory) => {
      const root = path.join(directory, "docs");
      const outDir = path.join(directory, "out");
      await writeFiles(root, {
        "index.md": "# Shared home\n",
        "greeting.md": "# Shared greeting\n",
        "ja/index.md": "# 日本語ホーム\n",
        "ja/guide.md": "# 日本語ガイド\n",
        "en/index.md": "# English home\n",
      });

      await runBuild({
        root,
        outDir,
        origin: "https://example.com",
        basePath: "/project",
        locales: ["ja", "en"],
      });

      expect(await listFiles(outDir)).toEqual([
        ".tsumugu-build",
        "documents.json",
        "en/documents.json",
        "en/index.html",
        "en/llms.txt",
        "en/search.json",
        "en/search/index.html",
        "greeting/index.html",
        "index.html",
        "ja/documents.json",
        "ja/guide/index.html",
        "ja/index.html",
        "ja/llms.txt",
        "ja/search.json",
        "ja/search/index.html",
        "llms.txt",
        "search.json",
        "search/index.html",
        "sitemap.xml",
      ]);

      const japanese = await readFile(
        path.join(outDir, "ja", "index.html"),
        "utf8",
      );
      expect(japanese).toContain('href="/project/ja/guide"');
      expect(japanese).toContain('content="/project/ja" name="tsumugu-base"');

      const sitemap = await readFile(path.join(outDir, "sitemap.xml"), "utf8");
      expect(sitemap).toContain(
        "<loc>https://example.com/project/ja/guide</loc>",
      );
    });
  });

  it("writes the same scoped bodies that development serves", async () => {
    await withTemporaryDirectory(async (directory) => {
      const root = path.join(directory, "docs");
      const outDir = path.join(directory, "out");
      await writeFiles(root, {
        "index.md": "# Shared home\n",
        "ja/index.md": "# 日本語ホーム\n",
        "ja/guide.md": "# 日本語ガイド\n",
        "en/index.md": "# English home\n",
      });
      running = await startDev({
        root,
        port: 0,
        watch: false,
        locales: ["ja", "en"],
        lang: "fr",
      });
      await runBuild({
        root,
        outDir,
        origin: "https://example.com",
        locales: ["ja", "en"],
        lang: "fr",
      });

      for (const [route, file] of [
        ["", "index.html"],
        ["ja", "ja/index.html"],
        ["ja/guide", "ja/guide/index.html"],
        ["ja/search", "ja/search/index.html"],
        ["documents.json", "documents.json"],
        ["ja/documents.json", "ja/documents.json"],
        ["ja/search.json", "ja/search.json"],
      ] as const) {
        expect(await readFile(path.join(outDir, file), "utf8"), route).toBe(
          await (await fetch(`${running.server.url}${route}`)).text(),
        );
      }
    });
  });

  it("lets authored scoped machine outputs override generated ones", async () => {
    await withTemporaryDirectory(async (directory) => {
      const root = path.join(directory, "docs");
      const outDir = path.join(directory, "out");
      await writeFiles(root, {
        "index.md": "# Shared\n",
        "ja/index.md": "# 日本語\n",
        "ja/documents.json": '{"authored":true}\n',
      });
      running = await startDev({
        root,
        port: 0,
        watch: false,
        locales: ["ja"],
      });
      expect(
        await (await fetch(`${running.server.url}ja/documents.json`)).text(),
      ).toBe('{"authored":true}\n');

      const report = await runBuild({
        root,
        outDir,
        locales: ["ja"],
      });
      expect(
        await readFile(path.join(outDir, "ja", "documents.json"), "utf8"),
      ).toBe('{"authored":true}\n');
      expect(report.diagnostics.map((entry) => entry.code)).toContain(
        "build/collision",
      );
    });
  });

  it("keeps the last good site when a configured locale disappears", async () => {
    await withTemporaryDirectory(async (root) => {
      await writeFiles(root, {
        "index.md": "# Shared home\n",
        "ja/index.md": "# 日本語ホーム\n",
      });
      running = await startDev({
        root,
        port: 0,
        watch: false,
        locales: ["ja"],
      });
      const before = await (await fetch(`${running.server.url}ja`)).text();

      await rm(path.join(root, "ja"), { recursive: true });
      await expect(running.site.update()).rejects.toThrow(
        `Locale "ja" directory ${root}/ja was not found.`,
      );

      expect(await (await fetch(`${running.server.url}ja`)).text()).toBe(
        before,
      );
    });
  });
});
