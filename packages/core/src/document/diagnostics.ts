import type { SourceRange } from "../ast/nodes.js";
import type { SourcePath } from "./paths.js";

/**
 * The shared diagnostics model.
 *
 * A documentation tool meets recoverable problems constantly: unparsable front
 * matter, an unsupported construct, a route two files both want, a link to a
 * page that does not exist. Writing those to the console makes them impossible
 * to test, aggregate, sort or render into a page — so every stage returns them
 * as values, and nothing in the pipeline logs.
 *
 * One model serves both presentations. The CLI formats these fields as text; a
 * theme renders the same fields as HTML. Neither is mentioned here, because a
 * diagnostic that knew about a terminal could not be shown in a browser.
 */

/**
 * How much a problem matters, measured by what it costs.
 *
 * - `warning` — the document is still usable. An unknown front-matter type, a
 *   symlink that was not followed.
 * - `error` — this document cannot be produced, but the rest of the project
 *   can. The document survives as a record, so the server can explain the
 *   failure rather than return nothing.
 * - `fatal` — nothing can be produced. An unreadable documentation root, a
 *   configuration file that cannot be parsed. There is no partial result worth
 *   showing, so the process reports and stops.
 *
 * The distinction is blast radius, not how annoying the problem is.
 */
export type DiagnosticSeverity = "warning" | "error" | "fatal";

/**
 * Which stage produced a diagnostic.
 *
 * Recorded because the same symptom means different things depending on where
 * it arose: a page that cannot be found is a broken link when the router says
 * it and a permissions problem when the scanner does.
 */
export type PipelineStage =
  | "scanner"
  | "document"
  | "routing"
  | "navigation"
  | "metadata"
  | "renderer"
  | "transformer"
  | "theme"
  | "serializer"
  | "server";

/** Another location that helps explain a diagnostic. */
export interface RelatedLocation {
  readonly message: string;
  readonly sourcePath?: SourcePath;
  readonly range?: SourceRange;
}

export interface DocumentDiagnostic {
  /**
   * A stable identifier of the form `stage/kebab-case`.
   *
   * Callers match on the code; the message is for humans and may be reworded
   * or eventually translated. Nothing should branch on message text.
   */
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  /** What went wrong, in a sentence a documentation author can act on. */
  readonly message: string;
  /**
   * What to do about it, when there is a concrete answer.
   *
   * Separate from the message so a presentation can show it differently, and
   * so messages are not padded with advice when there is none to give.
   */
  readonly hint?: string;
  /** Where the problem is, when it can be attributed to a file. */
  readonly sourcePath?: SourcePath;
  /**
   * Where in that file, when a parser reported a position.
   *
   * Optional because most stages have none: a route collision is a property of
   * two files, not of a line.
   */
  readonly range?: SourceRange;
  readonly stage?: PipelineStage;
  /**
   * The underlying failure, when this diagnostic came from a thrown error.
   *
   * Kept so a stack trace stays reachable while debugging. Deliberately not
   * part of a diagnostic's identity for sorting or deduplication: two reports
   * of one problem are one problem, whichever exception object produced them.
   */
  readonly cause?: unknown;
  /** Other places that help explain this one, such as the competing file. */
  readonly related?: readonly RelatedLocation[];
}

/** Whether a diagnostic prevents this document from being produced. */
export function isBlocking(diagnostic: DocumentDiagnostic): boolean {
  return diagnostic.severity !== "warning";
}

/** Whether a diagnostic prevents the process from continuing at all. */
export function isFatal(diagnostic: DocumentDiagnostic): boolean {
  return diagnostic.severity === "fatal";
}

/** Whether any diagnostic prevents the document from being produced. */
export function hasBlockingDiagnostic(
  diagnostics: readonly DocumentDiagnostic[],
): boolean {
  return diagnostics.some(isBlocking);
}

/** Whether any diagnostic means the process cannot continue. */
export function hasFatalDiagnostic(
  diagnostics: readonly DocumentDiagnostic[],
): boolean {
  return diagnostics.some(isFatal);
}

const severityOrder: Record<DiagnosticSeverity, number> = {
  fatal: 0,
  error: 1,
  warning: 2,
};

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function positionOf(diagnostic: DocumentDiagnostic): number {
  return diagnostic.range?.start.offset ?? -1;
}

/**
 * Orders diagnostics deterministically: worst first, then by file, then by
 * position within the file, then by code and message.
 *
 * Stages may run concurrently, so the order diagnostics arrive in depends on
 * scheduling. Sorting means the same project always reports the same list,
 * which is what makes the output diffable and the tests meaningful.
 *
 * Position ordering serves the second-most-common workflow after "what is
 * wrong": working down a file fixing things.
 */
export function sortDiagnostics(
  diagnostics: readonly DocumentDiagnostic[],
): DocumentDiagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      compare(a.sourcePath ?? "", b.sourcePath ?? "") ||
      positionOf(a) - positionOf(b) ||
      compare(a.code, b.code) ||
      compare(a.message, b.message),
  );
}

/**
 * Identity of a diagnostic, for deduplication.
 *
 * Excludes `cause`, `hint` and `related`: those explain a problem rather than
 * distinguish one. Two stages reporting the same failure at the same place are
 * one problem, however differently each described it.
 */
function identityOf(diagnostic: DocumentDiagnostic): string {
  return [
    diagnostic.severity,
    diagnostic.sourcePath ?? "",
    String(positionOf(diagnostic)),
    diagnostic.code,
    diagnostic.message,
  ].join(" ");
}

/**
 * Removes diagnostics that repeat one already reported.
 *
 * The same underlying problem is often noticed by more than one stage — a file
 * that cannot be parsed produces a render failure and then a routing failure.
 * Reporting it once is the useful behaviour; the result stays sorted.
 */
export function dedupeDiagnostics(
  diagnostics: readonly DocumentDiagnostic[],
): DocumentDiagnostic[] {
  const seen = new Set<string>();
  const unique: DocumentDiagnostic[] = [];

  for (const diagnostic of sortDiagnostics(diagnostics)) {
    const identity = identityOf(diagnostic);
    if (!seen.has(identity)) {
      seen.add(identity);
      unique.push(diagnostic);
    }
  }

  return unique;
}

/**
 * Formats a diagnostic as plain text.
 *
 * No colour, no symbols, no terminal escape codes. Those are a presentation
 * decision belonging to whatever is displaying this, and baking them in would
 * make the same function useless in a browser, a log file, or a test
 * assertion. A theme rendering these as HTML reads the same fields.
 *
 * The shape follows the compiler convention `file:line:column: severity code —
 * message`, because editors and humans already know how to read it.
 */
export function formatDiagnostic(diagnostic: DocumentDiagnostic): string {
  const location = [
    diagnostic.sourcePath,
    diagnostic.range?.start.line,
    diagnostic.range?.start.column,
  ]
    .filter((part) => part !== undefined)
    .join(":");

  const head = location === "" ? "" : `${location}: `;
  const lines = [
    `${head}${diagnostic.severity} ${diagnostic.code} — ${diagnostic.message}`,
  ];

  if (diagnostic.hint !== undefined) {
    lines.push(`  hint: ${diagnostic.hint}`);
  }
  for (const related of diagnostic.related ?? []) {
    const where =
      related.sourcePath === undefined ? "" : `${related.sourcePath}: `;
    lines.push(`  see also: ${where}${related.message}`);
  }

  return lines.join("\n");
}

/** Formats a list, sorted and deduplicated, one diagnostic per block. */
export function formatDiagnostics(
  diagnostics: readonly DocumentDiagnostic[],
): string {
  return dedupeDiagnostics(diagnostics).map(formatDiagnostic).join("\n");
}

/** Counts by severity, for a summary line. */
export function summarizeDiagnostics(
  diagnostics: readonly DocumentDiagnostic[],
): Record<DiagnosticSeverity, number> {
  const counts: Record<DiagnosticSeverity, number> = {
    fatal: 0,
    error: 0,
    warning: 0,
  };
  for (const diagnostic of diagnostics) {
    counts[diagnostic.severity] += 1;
  }
  return counts;
}
