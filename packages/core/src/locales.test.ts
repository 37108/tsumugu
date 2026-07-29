import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalizeLocale,
  canonicalizeLocales,
  validateLocaleDirectories,
} from "./locales.js";

describe("locale configuration", () => {
  it("canonicalizes Unicode locale identifiers", () => {
    expect(canonicalizeLocale("zh-hant")).toBe("zh-Hant");
    expect(canonicalizeLocales(["ja", "en-us"])).toEqual(["ja", "en-US"]);
  });

  it("rejects invalid, duplicate, and reserved locale identifiers", () => {
    expect(() => canonicalizeLocales(["en_US"])).toThrow(/valid BCP 47/u);
    expect(() => canonicalizeLocales(["en-US", "en-us"])).toThrow(
      /more than once/u,
    );
    expect(() => canonicalizeLocales(["search"])).toThrow(/\/search/u);
  });

  it("requires canonical direct child directories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tsumugu-locales-"));
    try {
      await mkdir(path.join(root, "en-US"));
      await writeFile(path.join(root, "ja"), "not a directory");

      await expect(validateLocaleDirectories(root, ["en-us"])).resolves.toEqual(
        ["en-US"],
      );
      await expect(validateLocaleDirectories(root, ["ja"])).rejects.toThrow(
        `Locale "ja" directory ${path.join(root, "ja")} was not found.`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
