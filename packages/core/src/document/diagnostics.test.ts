import { describe, expect, it } from "vitest";

import {
  dedupeDiagnostics,
  hasBlockingDiagnostic,
  sortDiagnostics,
  type DocumentDiagnostic,
} from "./diagnostics.js";
import { toSourcePath, type SourcePath } from "./paths.js";

function sourcePath(value: string): SourcePath {
  const result = toSourcePath(value);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

const warning: DocumentDiagnostic = {
  code: "test/warning",
  severity: "warning",
  message: "a recoverable problem",
};

const error: DocumentDiagnostic = {
  code: "test/error",
  severity: "error",
  message: "a document-blocking problem",
};

describe("hasBlockingDiagnostic", () => {
  it("is false when nothing is wrong", () => {
    expect(hasBlockingDiagnostic([])).toBe(false);
  });

  it("is false for warnings alone", () => {
    expect(hasBlockingDiagnostic([warning, warning])).toBe(false);
  });

  it("is true when any diagnostic is an error", () => {
    expect(hasBlockingDiagnostic([warning, error])).toBe(true);
  });
});

describe("sortDiagnostics", () => {
  it("puts errors before warnings", () => {
    expect(sortDiagnostics([warning, error]).map((d) => d.severity)).toEqual([
      "error",
      "warning",
    ]);
  });

  it("orders by source path, then code, then message", () => {
    const diagnostics: DocumentDiagnostic[] = [
      {
        ...warning,
        code: "beta",
        message: "second",
        sourcePath: sourcePath("docs/b.md"),
      },
      {
        ...warning,
        code: "beta",
        message: "second",
        sourcePath: sourcePath("docs/a.md"),
      },
      {
        ...warning,
        code: "alpha",
        message: "second",
        sourcePath: sourcePath("docs/a.md"),
      },
      {
        ...warning,
        code: "alpha",
        message: "first",
        sourcePath: sourcePath("docs/a.md"),
      },
    ];

    expect(
      sortDiagnostics(diagnostics).map(
        (d) => `${d.sourcePath ?? ""} ${d.code} ${d.message}`,
      ),
    ).toEqual([
      "docs/a.md alpha first",
      "docs/a.md alpha second",
      "docs/a.md beta second",
      "docs/b.md beta second",
    ]);
  });

  it("is stable regardless of input order", () => {
    // Stages may run concurrently, so the arrival order is not meaningful. The
    // same set must always produce the same report.
    const diagnostics = [
      { ...warning, code: "c" },
      { ...error, code: "a" },
      { ...warning, code: "b" },
    ];

    const forwards = sortDiagnostics(diagnostics).map((d) => d.code);
    const backwards = sortDiagnostics([...diagnostics].reverse()).map(
      (d) => d.code,
    );

    expect(forwards).toEqual(backwards);
  });

  it("does not modify its input", () => {
    const diagnostics = [warning, error];
    sortDiagnostics(diagnostics);

    expect(diagnostics.map((d) => d.severity)).toEqual(["warning", "error"]);
  });
});

describe("dedupeDiagnostics", () => {
  it("reports an identical problem once", () => {
    // The same underlying failure is often noticed by more than one stage.
    expect(dedupeDiagnostics([warning, warning, warning])).toEqual([warning]);
  });

  it("keeps diagnostics that differ in any field", () => {
    const other: DocumentDiagnostic = { ...warning, message: "different" };
    const elsewhere: DocumentDiagnostic = {
      ...warning,
      sourcePath: sourcePath("docs/a.md"),
    };

    expect(dedupeDiagnostics([warning, other, elsewhere])).toHaveLength(3);
  });

  it("does not merge a warning with an error that otherwise matches", () => {
    const sameButFatal: DocumentDiagnostic = { ...warning, severity: "error" };

    expect(dedupeDiagnostics([warning, sameButFatal])).toHaveLength(2);
  });

  it("returns a sorted result", () => {
    expect(
      dedupeDiagnostics([warning, error, warning]).map((d) => d.severity),
    ).toEqual(["error", "warning"]);
  });

  it("handles an empty list", () => {
    expect(dedupeDiagnostics([])).toEqual([]);
  });
});
