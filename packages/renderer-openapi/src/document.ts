/**
 * An OpenAPI description, read into the shape this renderer needs.
 *
 * The types here describe what is read, not what OpenAPI permits: a description
 * is somebody else's JSON, so every field is checked before it is used and
 * anything unrecognised is left alone rather than assumed. That is also why
 * nothing here is `any` — an untyped bag would move these checks into the
 * renderer, one property access at a time.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export function isRecord(
  value: unknown,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is a list.
 *
 * `Array.isArray` narrows to `any[]`, which turns every element of a JSON list
 * into `any` and takes the checks with it. This keeps the element type.
 */
export function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

export function stringAt(
  record: { readonly [key: string]: JsonValue },
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

/** The HTTP methods an operation can be written under. */
export const methods = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

export type Method = (typeof methods)[number];

export interface Parameter {
  readonly name: string;
  /** `query`, `path`, `header` or `cookie`, as written. */
  readonly location: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
}

export interface Response {
  readonly status: string;
  readonly description: string;
  readonly contentTypes: readonly string[];
}

export interface RequestBody {
  readonly required: boolean;
  readonly description: string;
  readonly contentTypes: readonly string[];
  /** The first schema the body declares, already resolved, as JSON text. */
  readonly schema?: string;
}

export interface Operation {
  readonly method: Method;
  readonly path: string;
  readonly summary: string;
  readonly description: string;
  readonly deprecated: boolean;
  readonly tags: readonly string[];
  readonly parameters: readonly Parameter[];
  readonly requestBody?: RequestBody;
  readonly responses: readonly Response[];
}

export interface Tag {
  readonly name: string;
  readonly description: string;
}

export interface ApiDescription {
  readonly title: string;
  readonly version: string;
  readonly description: string;
  /** Tags in the order the description declares them, then first use. */
  readonly tags: readonly Tag[];
  readonly operations: readonly Operation[];
}
