import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RoutePath } from "../document/paths.js";

import { readAsset } from "./assets.js";

/**
 * Asset serving, against real files.
 *
 * Every rule here is about the file system, and a fake one would prove nothing:
 * the cases that matter are a symbolic link pointing outside the root and a
 * name with a space in it, and neither exists until a real directory does.
 */

let root: string;
let outside: string;

beforeEach(async () => {
  const base = await mkdtemp(path.join(tmpdir(), "tsumugu-assets-"));
  root = path.join(base, "docs");
  outside = path.join(base, "private");

  await mkdir(path.join(root, "images"), { recursive: true });
  await mkdir(outside, { recursive: true });

  await writeFile(path.join(root, "images", "diagram.png"), "not really a png");
  await writeFile(path.join(root, "images", "a name.png"), "spaced");
  await writeFile(path.join(root, "images", "図.png"), "unicode");
  await writeFile(path.join(root, "notes.txt"), "plain");
  await writeFile(path.join(root, "example.js"), "alert(1)");
  await writeFile(path.join(root, "archive.bin"), "binary");
  await writeFile(path.join(root, "index.md"), "# A document\n");
  await writeFile(path.join(root, ".env"), "SECRET=1");
  await writeFile(path.join(outside, "secrets.txt"), "do not serve");
});

afterEach(async () => {
  await rm(path.dirname(root), { recursive: true, force: true });
});

function route(value: string): RoutePath {
  return value as RoutePath;
}

async function read(value: string): Promise<{
  readonly served: boolean;
  readonly contentType?: string;
  readonly text?: string;
}> {
  const result = await readAsset(root, route(value));
  return result.ok
    ? {
        served: true,
        contentType: result.contentType,
        text: new TextDecoder().decode(result.bytes),
      }
    : { served: false };
}

describe("readAsset", () => {
  it("serves an image with its content type", async () => {
    expect(await read("/images/diagram.png")).toMatchObject({
      served: true,
      contentType: "image/png",
      text: "not really a png",
    });
  });

  it("serves a name containing a space", async () => {
    // Routes are stored decoded, so this is what a request for
    // "/images/a%20name.png" resolves to.
    expect((await read("/images/a name.png")).served).toBe(true);
  });

  it("serves a name outside ASCII", async () => {
    expect((await read("/images/図.png")).served).toBe(true);
  });

  it("serves an unknown format as a download rather than as markup", async () => {
    expect(await read("/archive.bin")).toMatchObject({
      served: true,
      contentType: "application/octet-stream",
    });
  });

  it("serves JavaScript as text, so documentation scripts never run", async () => {
    expect(await read("/example.js")).toMatchObject({
      served: true,
      contentType: "text/plain; charset=utf-8",
    });
  });

  it("serves JavaScript as JavaScript once the operator has trusted the root", async () => {
    // What `script-src 'self'` promises a trusted page: a script file in the
    // root can actually be loaded, rather than refused by nosniff first.
    const result = await readAsset(root, route("/example.js"), { trust: true });

    expect(result.ok && result.contentType).toBe(
      "text/javascript; charset=utf-8",
    );
  });

  it("refuses a document's source, which is served as a page instead", async () => {
    expect((await read("/index.md")).served).toBe(false);
  });

  it("refuses a dotfile", async () => {
    expect((await read("/.env")).served).toBe(false);
  });

  it("refuses a path that climbs out of the root", async () => {
    expect((await read("/../private/secrets.txt")).served).toBe(false);
  });

  it("refuses a symbolic link that points outside the root", async () => {
    await symlink(
      path.join(outside, "secrets.txt"),
      path.join(root, "leak.txt"),
    );

    // Spelled entirely inside the root, and still outside it. Resolving the
    // path before checking it is the only way to see that.
    expect((await read("/leak.txt")).served).toBe(false);
  });

  it("follows a symbolic link that stays inside the root", async () => {
    await symlink(
      path.join(root, "notes.txt"),
      path.join(root, "also-notes.txt"),
    );

    expect((await read("/also-notes.txt")).served).toBe(true);
  });

  it("refuses a directory rather than listing it", async () => {
    expect((await read("/images")).served).toBe(false);
  });

  it("refuses a file that is not there", async () => {
    expect((await read("/images/missing.png")).served).toBe(false);
  });

  it("refuses the root itself", async () => {
    expect((await read("/")).served).toBe(false);
  });

  it("refuses a path with no extension, which is a document route", async () => {
    expect((await read("/notes")).served).toBe(false);
  });
});
