import type {
  DocumentDiagnostic,
  MetadataValue,
  SourcePath,
} from "tsumugu-core";
import { parse as parseYaml } from "yaml";

/**
 * YAML front matter.
 *
 * The renderer reads what the author wrote and hands back raw entries. It does
 * **not** decide what a title is: that precedence is shared across formats and
 * lives in core, so an HTML page and a Markdown page cannot disagree.
 */

export const frontMatterCodes = {
  invalid: "renderer-markdown/invalid-front-matter",
  unsupportedValue: "renderer-markdown/unsupported-metadata-value",
} as const;

export interface FrontMatterResult {
  readonly entries: readonly (readonly [string, MetadataValue])[];
  readonly diagnostics: readonly DocumentDiagnostic[];
}

const empty: FrontMatterResult = { entries: [], diagnostics: [] };

/**
 * Converts a parsed YAML value into a metadata value, or `undefined`.
 *
 * Metadata is restricted to what survives a round trip through JSON, because
 * it ends up in the machine-readable exports. A YAML date or a nested mapping
 * has no representation there, so it is reported rather than coerced into
 * something that looks like the author's intent but is not.
 */
function toMetadataValue(value: unknown): MetadataValue | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value.map(toMetadataValue);
    return items.every((item): item is MetadataValue => item !== undefined)
      ? items
      : undefined;
  }
  return undefined;
}

function describe(value: unknown): string {
  if (Array.isArray(value)) {
    return "a list containing unsupported values";
  }
  if (value instanceof Date) {
    return "a date";
  }
  return typeof value === "object" ? "a nested mapping" : typeof value;
}

/**
 * Reads a YAML front-matter block.
 *
 * Invalid YAML is a warning, not an error. The document below it is perfectly
 * readable, and refusing to serve a page because its front matter has a stray
 * colon would punish a reader for an author's typo.
 */
export function readFrontMatter(
  yaml: string,
  sourcePath: SourcePath,
): FrontMatterResult {
  if (yaml.trim() === "") {
    return empty;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(yaml);
  } catch (cause) {
    return {
      entries: [],
      diagnostics: [
        {
          code: frontMatterCodes.invalid,
          severity: "warning",
          stage: "renderer",
          message: `The front matter in "${sourcePath}" is not valid YAML: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          hint: "The rest of the document is used as written. Check for a stray colon or an unclosed quote.",
          sourcePath,
          cause,
        },
      ],
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      entries: [],
      diagnostics: [
        {
          code: frontMatterCodes.invalid,
          severity: "warning",
          stage: "renderer",
          message: `The front matter in "${sourcePath}" is not a mapping of keys to values.`,
          hint: 'Front matter looks like "title: My page", one key per line.',
          sourcePath,
        },
      ],
    };
  }

  const entries: (readonly [string, MetadataValue])[] = [];
  const diagnostics: DocumentDiagnostic[] = [];

  // Sorted, so the entries a document produces do not depend on the order
  // YAML happened to hand back its keys.
  for (const key of Object.keys(parsed).sort()) {
    const raw = (parsed as Record<string, unknown>)[key];
    const value = toMetadataValue(raw);

    if (value === undefined) {
      diagnostics.push({
        code: frontMatterCodes.unsupportedValue,
        severity: "warning",
        stage: "renderer",
        message: `Front-matter key "${key}" in "${sourcePath}" is ${describe(raw)}, which metadata cannot represent.`,
        hint: "Metadata values may be text, numbers, true/false, null, or a list of those.",
        sourcePath,
      });
      continue;
    }

    entries.push([key, value]);
  }

  return { entries, diagnostics };
}
