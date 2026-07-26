import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { repositoryRoot, toPosixPath } from "./paths.js";

describe("toPosixPath", () => {
  it("rewrites Windows separators", () => {
    expect(toPosixPath("packages\\core")).toBe("packages/core");
    expect(toPosixPath("internal\\tsconfig\\base.json")).toBe(
      "internal/tsconfig/base.json",
    );
  });

  it("leaves POSIX paths unchanged", () => {
    expect(toPosixPath("packages/core")).toBe("packages/core");
    expect(toPosixPath("index.ts")).toBe("index.ts");
  });

  it("collapses repeated and mixed separators", () => {
    expect(toPosixPath("packages\\\\core")).toBe("packages/core");
    expect(toPosixPath("packages//core")).toBe("packages/core");
    expect(toPosixPath("packages\\core/src")).toBe("packages/core/src");
  });

  it("drops leading and trailing separators", () => {
    expect(toPosixPath("/packages/core/")).toBe("packages/core");
    expect(toPosixPath("\\packages\\core\\")).toBe("packages/core");
  });

  it("returns an empty string for input with no segments", () => {
    expect(toPosixPath("")).toBe("");
    expect(toPosixPath("/")).toBe("");
  });

  it("normalizes whatever the host platform's path module produces", () => {
    // The point of the helper: `path.join` uses the host separator, and this
    // assertion must hold on Windows as well as on Linux and macOS.
    expect(toPosixPath(path.join("packages", "core", "src"))).toBe(
      "packages/core/src",
    );
  });
});

describe("repositoryRoot", () => {
  it("resolves to the directory holding the workspace definition", () => {
    // Derived from this file's location rather than the working directory, so
    // it must hold no matter where the runner was started.
    expect(existsSync(path.join(repositoryRoot, "pnpm-workspace.yaml"))).toBe(
      true,
    );
    expect(existsSync(path.join(repositoryRoot, "package.json"))).toBe(true);
  });
});
