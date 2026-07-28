import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { repositoryRoot } from "./helpers/paths.js";

/**
 * The ADR and RFC indexes, kept honest.
 *
 * An index that drifts from its directory is worse than no index: it tells a
 * reader the record they are looking for does not exist. Each README promises
 * to list every record beside it, and this is the promise being kept.
 */

interface Register {
  readonly directory: string;
  readonly files: readonly string[];
  readonly index: string;
}

async function read(name: string): Promise<Register> {
  const directory = path.join(repositoryRoot, "docs", name);
  const entries = await readdir(directory);

  return {
    directory: name,
    files: entries
      .filter((entry) => /^\d{4}-.+\.md$/u.test(entry))
      .filter((entry) => !entry.startsWith("0000-"))
      .sort(),
    index: await readFile(path.join(directory, "README.md"), "utf8"),
  };
}

let registers: readonly Register[];

beforeAll(async () => {
  registers = await Promise.all([read("decisions"), read("rfcs")]);
});

describe("decision and RFC indexes", () => {
  it("finds records to check", () => {
    for (const register of registers) {
      expect(register.files.length, register.directory).toBeGreaterThan(0);
    }
  });

  it("lists every record in the index", () => {
    for (const register of registers) {
      for (const file of register.files) {
        expect(
          register.index,
          `docs/${register.directory}/README.md does not link ${file}`,
        ).toContain(`(${file})`);
      }
    }
  });

  it("links no record that does not exist", () => {
    for (const register of registers) {
      const linked = [...register.index.matchAll(/\((\d{4}-[^)]+\.md)\)/gu)]
        .map((match) => match[1])
        .filter((file) => file !== undefined);

      for (const file of linked) {
        expect(
          register.files,
          `docs/${register.directory}/README.md links ${file}, which is not there`,
        ).toContain(file);
      }
    }
  });

  it("gives every record a status", async () => {
    for (const register of registers) {
      for (const file of register.files) {
        const text = await readFile(
          path.join(repositoryRoot, "docs", register.directory, file),
          "utf8",
        );

        expect(text, `${register.directory}/${file}`).toMatch(
          /\*\*Status:\*\*/u,
        );
      }
    }
  });
});
