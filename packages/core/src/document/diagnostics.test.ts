import { describe, expect, it } from "vitest";

import {
  dedupeDiagnostics,
  formatDiagnostic,
  formatDiagnostics,
  hasBlockingDiagnostic,
  hasFatalDiagnostic,
  isBlocking,
  isFatal,
  sortDiagnostics,
  summarizeDiagnostics,
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

describe("fatal severity", () => {
  const fatal: DocumentDiagnostic = {
    code: "test/fatal",
    severity: "fatal",
    message: "nothing can be produced",
  };

  it("separates 'this document failed' from 'nothing can be produced'", () => {
    // Blast radius, not annoyance: an error costs one page, a fatal costs the
    // whole run.
    expect(isBlocking(error)).toBe(true);
    expect(isFatal(error)).toBe(false);
    expect(isBlocking(fatal)).toBe(true);
    expect(isFatal(fatal)).toBe(true);
    expect(isBlocking(warning)).toBe(false);
  });

  it("is detected across a list", () => {
    expect(hasFatalDiagnostic([warning, error])).toBe(false);
    expect(hasFatalDiagnostic([warning, fatal])).toBe(true);
    expect(hasBlockingDiagnostic([warning, fatal])).toBe(true);
  });

  it("sorts before errors and warnings", () => {
    expect(
      sortDiagnostics([warning, error, fatal]).map((d) => d.severity),
    ).toEqual(["fatal", "error", "warning"]);
  });
});

describe("position ordering", () => {
  function at(offset: number, line: number): DocumentDiagnostic {
    return {
      ...warning,
      code: "test/at",
      sourcePath: sourcePath("docs/a.md"),
      range: {
        start: { line, column: 1, offset },
        end: { line, column: 2, offset: offset + 1 },
      },
    };
  }

  it("orders within a file by position", () => {
    // Serves the workflow that follows "what is wrong": working down a file.
    expect(
      sortDiagnostics([at(90, 9), at(10, 1), at(50, 5)]).map(
        (d) => d.range?.start.line,
      ),
    ).toEqual([1, 5, 9]);
  });

  it("puts a diagnostic with no position before positioned ones", () => {
    const whole = {
      ...warning,
      code: "test/at",
      sourcePath: sourcePath("docs/a.md"),
    };

    expect(
      sortDiagnostics([at(10, 1), whole]).map((d) => d.range?.start.offset),
    ).toEqual([undefined, 10]);
  });

  it("treats two diagnostics at different positions as distinct", () => {
    expect(dedupeDiagnostics([at(10, 1), at(50, 5)])).toHaveLength(2);
  });
});

describe("dedupe identity", () => {
  it("ignores fields that explain rather than distinguish", () => {
    // Two stages describing one failure differently are still one failure.
    const first: DocumentDiagnostic = { ...error, cause: new Error("a") };
    const second: DocumentDiagnostic = {
      ...error,
      cause: new Error("b"),
      hint: "try something",
      related: [{ message: "elsewhere" }],
    };

    expect(dedupeDiagnostics([first, second])).toHaveLength(1);
  });
});

describe("formatDiagnostic", () => {
  it("uses the compiler convention editors already read", () => {
    const diagnostic: DocumentDiagnostic = {
      code: "routing/collision",
      severity: "error",
      message: "two files map to /guide",
      sourcePath: sourcePath("docs/guide.md"),
      range: {
        start: { line: 12, column: 3, offset: 100 },
        end: { line: 12, column: 8, offset: 105 },
      },
    };

    expect(formatDiagnostic(diagnostic)).toBe(
      "docs/guide.md:12:3: error routing/collision — two files map to /guide",
    );
  });

  it("omits the location when there is none", () => {
    expect(formatDiagnostic(warning)).toBe(
      "warning test/warning — a recoverable problem",
    );
  });

  it("shows only the file when there is no position", () => {
    expect(
      formatDiagnostic({ ...warning, sourcePath: sourcePath("docs/a.md") }),
    ).toBe("docs/a.md: warning test/warning — a recoverable problem");
  });

  it("puts a hint and related locations on their own lines", () => {
    const formatted = formatDiagnostic({
      ...error,
      hint: "rename one of them",
      related: [
        {
          message: 'also maps to "/guide"',
          sourcePath: sourcePath("docs/b.md"),
        },
        { message: "no file for this one" },
      ],
    });

    expect(formatted.split("\n")).toEqual([
      "error test/error — a document-blocking problem",
      "  hint: rename one of them",
      '  see also: docs/b.md: also maps to "/guide"',
      "  see also: no file for this one",
    ]);
  });

  it("emits no colour or terminal escape codes", () => {
    // Presentation belongs to whatever is displaying this. Baking in escapes
    // would make the same function useless in a browser or a log file.
    expect(formatDiagnostic({ ...error, hint: "x" })).not.toContain("");
  });
});

describe("formatDiagnostics", () => {
  it("sorts and deduplicates before formatting", () => {
    const lines = formatDiagnostics([warning, error, warning]).split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("error");
    expect(lines[1]).toContain("warning");
  });

  it("returns an empty string for nothing to report", () => {
    expect(formatDiagnostics([])).toBe("");
  });
});

describe("summarizeDiagnostics", () => {
  it("counts by severity", () => {
    expect(summarizeDiagnostics([warning, warning, error])).toEqual({
      fatal: 0,
      error: 1,
      warning: 2,
    });
  });

  it("counts nothing as zeroes rather than as missing keys", () => {
    expect(summarizeDiagnostics([])).toEqual({
      fatal: 0,
      error: 0,
      warning: 0,
    });
  });
});
