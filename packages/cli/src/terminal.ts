import {
  formatDiagnostic,
  summarizeDiagnostics,
  type DocumentDiagnostic,
} from "tsumugu-core";

/**
 * What the terminal sees.
 *
 * Presentation, and only presentation: the pipeline returns diagnostics as
 * values and this decides how they read. Colour is added here rather than in
 * the diagnostics themselves, because a diagnostic rendered into a page or
 * written to a file must not carry escape codes.
 *
 * ## Colour
 *
 * On when the stream is a terminal and `NO_COLOR` is unset, off otherwise. A
 * pipe, a CI log and a file all get plain text, which is what makes the output
 * greppable and diffable. The palette is the eight basic colours: a 256-colour
 * shade renders as something unreadable on the terminals that have their own
 * ideas about the palette.
 */

export interface TerminalStyle {
  readonly bold: (value: string) => string;
  readonly dim: (value: string) => string;
  readonly warning: (value: string) => string;
  readonly error: (value: string) => string;
  readonly accent: (value: string) => string;
}

const plain: TerminalStyle = {
  bold: (value) => value,
  dim: (value) => value,
  warning: (value) => value,
  error: (value) => value,
  accent: (value) => value,
};

function wrap(code: string): (value: string) => string {
  return (value) => `[${code}m${value}[0m`;
}

const coloured: TerminalStyle = {
  bold: wrap("1"),
  dim: wrap("2"),
  warning: wrap("33"),
  error: wrap("31"),
  accent: wrap("36"),
};

export interface ColourOptions {
  readonly isTty?: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Decides whether to colour.
 *
 * `NO_COLOR` wins over everything, because a reader who set it has already
 * answered this question — see https://no-color.org.
 */
export function styleFor(options: ColourOptions = {}): TerminalStyle {
  const env = options.env ?? process.env;

  if (env["NO_COLOR"] !== undefined && env["NO_COLOR"] !== "") {
    return plain;
  }
  if (env["FORCE_COLOR"] !== undefined && env["FORCE_COLOR"] !== "0") {
    return coloured;
  }
  return options.isTty === true ? coloured : plain;
}

/**
 * Formats diagnostics for a terminal: worst first, with a count above them.
 *
 * The count exists because a wall of warnings after a startup message is a wall
 * nobody reads. One line says how much there is, and the reader decides whether
 * to look.
 */
export function formatForTerminal(
  diagnostics: readonly DocumentDiagnostic[],
  style: TerminalStyle,
): string {
  if (diagnostics.length === 0) {
    return "";
  }

  const counts = summarizeDiagnostics(diagnostics);
  const parts: string[] = [];

  if (counts.fatal > 0) {
    parts.push(style.error(`${String(counts.fatal)} fatal`));
  }
  if (counts.error > 0) {
    parts.push(style.error(pluralize(counts.error, "error")));
  }
  if (counts.warning > 0) {
    parts.push(style.warning(pluralize(counts.warning, "warning")));
  }

  const lines = [style.bold(parts.join(", "))];

  for (const diagnostic of diagnostics) {
    lines.push(colourize(formatDiagnostic(diagnostic), diagnostic, style));
  }

  return lines.join("\n");
}

function pluralize(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Colours the severity word inside an already-formatted diagnostic.
 *
 * The formatter owns the layout; this only tints it, so the two cannot disagree
 * about what a diagnostic looks like.
 */
function colourize(
  formatted: string,
  diagnostic: DocumentDiagnostic,
  style: TerminalStyle,
): string {
  const tint = diagnostic.severity === "warning" ? style.warning : style.error;
  return formatted.replace(diagnostic.severity, tint(diagnostic.severity));
}
