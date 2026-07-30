import {
  isList,
  isRecord,
  methods,
  stringAt,
  type ApiDescription,
  type JsonValue,
  type Operation,
  type Parameter,
  type RequestBody,
  type Response,
  type Tag,
} from "./document.js";

/**
 * Reading a description, including what it points at.
 *
 * Two rules run through this file. Nothing is trusted: a description is data a
 * project wrote, so a missing field, a wrong type or a reference into nowhere
 * produces a diagnostic and a page that still renders. And nothing is invented:
 * where a value cannot be read, the page says what was written rather than a
 * plausible default, because a reference manual that guesses is worse than one
 * that admits a gap.
 */

export interface ReadProblem {
  readonly message: string;
  readonly hint?: string;
}

export interface ReadResult {
  readonly description?: ApiDescription;
  readonly problems: readonly ReadProblem[];
}

/** How deep `$ref` resolution goes before it stops and shows the name. */
const maxDepth = 12;

interface Context {
  readonly root: { readonly [key: string]: JsonValue };
  readonly problems: ReadProblem[];
}

/**
 * Follows a `$ref` within this description.
 *
 * Only within: a reference into another file names something this build has not
 * read and cannot check, so it is reported and left as its own name. Depth is
 * bounded because a schema that refers to itself is ordinary — a comment with
 * replies, a tree of categories — and must not be a build that never finishes.
 */
function resolve(
  value: JsonValue,
  context: Context,
  depth = 0,
): JsonValue | undefined {
  if (!isRecord(value)) {
    return value;
  }

  const reference = stringAt(value, "$ref");
  if (reference === undefined) {
    return value;
  }

  if (!reference.startsWith("#/")) {
    context.problems.push({
      message: `"${reference}" points outside this file, so it is shown by name rather than expanded.`,
      hint: "Inline the definition, or move it into this description's components.",
    });
    return { name: reference };
  }

  if (depth >= maxDepth) {
    // A cycle, or a chain long enough to be one. The name is what a reader
    // needs at this point anyway.
    return { name: reference.slice(reference.lastIndexOf("/") + 1) };
  }

  let current: JsonValue = context.root;
  for (const rawSegment of reference.slice(2).split("/")) {
    const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isRecord(current)) {
      current = {};
      break;
    }
    const next: JsonValue | undefined = current[segment];
    if (next === undefined) {
      context.problems.push({
        message: `"${reference}" does not exist in this description, so it is shown by name.`,
      });
      return { name: reference.slice(reference.lastIndexOf("/") + 1) };
    }
    current = next;
  }

  return resolve(current, context, depth + 1);
}

/** A schema, as the JSON text a reader can compare their payload against. */
function schemaText(
  value: JsonValue | undefined,
  context: Context,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const resolved = expand(value, context, 0);
  return JSON.stringify(resolved, null, 2);
}

/**
 * Expands references inside a value, one level of recursion at a time.
 *
 * A schema that refers back to itself expands once and then shows the name, so
 * a reader sees the shape without the page growing forever.
 */
function expand(value: JsonValue, context: Context, depth: number): JsonValue {
  if (depth >= 3) {
    return value;
  }
  if (isList(value)) {
    return value.map((item) => expand(item, context, depth + 1));
  }
  if (!isRecord(value)) {
    return value;
  }

  const resolved = resolve(value, context, depth);
  if (!isRecord(resolved)) {
    return resolved ?? value;
  }

  const expanded: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(resolved)) {
    expanded[key] = expand(item, context, depth + 1);
  }
  return expanded;
}

/** A type, named the way an author reading a table expects to see it. */
function typeOf(schema: JsonValue | undefined, context: Context): string {
  if (schema === undefined) {
    return "";
  }
  const resolved = resolve(schema, context);
  if (!isRecord(resolved)) {
    return "";
  }

  const named = stringAt(resolved, "name");
  const type = stringAt(resolved, "type");
  const format = stringAt(resolved, "format");

  if (type === "array") {
    const items = resolved["items"];
    const inner = items === undefined ? "" : typeOf(items, context);
    return inner === "" ? "array" : `array of ${inner}`;
  }
  if (type !== undefined) {
    return format === undefined ? type : `${type} (${format})`;
  }
  // A resolved `$ref` that was left as its own name.
  return named ?? "";
}

function readParameters(
  value: JsonValue | undefined,
  context: Context,
): Parameter[] {
  if (value === undefined || !isList(value)) {
    return [];
  }

  const parameters: Parameter[] = [];
  for (const entry of value) {
    const resolved = resolve(entry, context);
    if (!isRecord(resolved)) {
      continue;
    }
    const name = stringAt(resolved, "name");
    if (name === undefined) {
      continue;
    }
    parameters.push({
      name,
      location: stringAt(resolved, "in") ?? "",
      type: typeOf(resolved["schema"], context),
      required: resolved["required"] === true,
      description: stringAt(resolved, "description") ?? "",
    });
  }
  return parameters;
}

function readResponses(
  value: JsonValue | undefined,
  context: Context,
): Response[] {
  if (!isRecord(value)) {
    return [];
  }

  const responses: Response[] = [];
  for (const [status, entry] of Object.entries(value)) {
    const resolved = resolve(entry, context);
    const content = isRecord(resolved) ? resolved["content"] : undefined;
    responses.push({
      status,
      description: isRecord(resolved)
        ? (stringAt(resolved, "description") ?? "")
        : "",
      contentTypes: isRecord(content) ? Object.keys(content) : [],
    });
  }
  return responses;
}

function readRequestBody(
  value: JsonValue | undefined,
  context: Context,
): RequestBody | undefined {
  const resolved = value === undefined ? undefined : resolve(value, context);
  if (!isRecord(resolved)) {
    return undefined;
  }

  const content = resolved["content"];
  const contentTypes = isRecord(content) ? Object.keys(content) : [];
  const firstType = contentTypes[0];
  const first =
    firstType !== undefined && isRecord(content)
      ? content[firstType]
      : undefined;
  const schema = isRecord(first) ? first["schema"] : undefined;

  return {
    required: resolved["required"] === true,
    description: stringAt(resolved, "description") ?? "",
    contentTypes,
    ...(schema === undefined
      ? {}
      : { schema: schemaText(schema, context) ?? "" }),
  };
}

/**
 * Reads a parsed description.
 *
 * @param root The description as parsed from YAML or JSON.
 */
export function readDescription(root: JsonValue): ReadResult {
  const problems: ReadProblem[] = [];

  if (!isRecord(root)) {
    return {
      problems: [
        { message: "This file does not contain an OpenAPI description." },
      ],
    };
  }

  const context: Context = { root, problems };
  const version = stringAt(root, "openapi");
  const swagger = stringAt(root, "swagger");

  if (version === undefined && swagger !== undefined) {
    problems.push({
      message: `This is a Swagger ${swagger} description, and Tsumugu reads OpenAPI 3.0 and 3.1.`,
      hint: "Convert it with a tool such as swagger2openapi, then point Tsumugu at the result.",
    });
  } else if (version === undefined) {
    problems.push({
      message:
        "This file declares no OpenAPI version, so its operations were not read.",
      hint: 'An OpenAPI description begins with `openapi: "3.1.0"` or similar.',
    });
  } else if (!version.startsWith("3.")) {
    problems.push({
      message: `This description declares OpenAPI ${version}, and Tsumugu reads 3.0 and 3.1.`,
    });
  }

  const info = isRecord(root["info"]) ? root["info"] : {};
  const declaredTags: Tag[] = [];
  const rawTags = root["tags"];
  if (rawTags !== undefined && isList(rawTags)) {
    for (const entry of rawTags) {
      if (!isRecord(entry)) {
        continue;
      }
      const name = stringAt(entry, "name");
      if (name !== undefined) {
        declaredTags.push({
          name,
          description: stringAt(entry, "description") ?? "",
        });
      }
    }
  }

  const operations: Operation[] = [];
  const paths = root["paths"];
  const readable = version !== undefined && version.startsWith("3.");

  if (readable && isRecord(paths)) {
    for (const [path, item] of Object.entries(paths)) {
      const resolvedItem = resolve(item, context);
      if (!isRecord(resolvedItem)) {
        continue;
      }
      // Parameters declared once for every method on the path.
      const shared = readParameters(resolvedItem["parameters"], context);

      for (const method of methods) {
        const operation = resolvedItem[method];
        if (!isRecord(operation)) {
          continue;
        }
        const rawOperationTags = operation["tags"];
        const tags =
          rawOperationTags !== undefined && isList(rawOperationTags)
            ? rawOperationTags.filter(
                (tag): tag is string => typeof tag === "string",
              )
            : [];

        operations.push({
          method,
          path,
          summary: stringAt(operation, "summary") ?? "",
          description: stringAt(operation, "description") ?? "",
          deprecated: operation["deprecated"] === true,
          tags,
          parameters: [
            ...shared,
            ...readParameters(operation["parameters"], context),
          ],
          ...(() => {
            const body = readRequestBody(operation["requestBody"], context);
            return body === undefined ? {} : { requestBody: body };
          })(),
          responses: readResponses(operation["responses"], context),
        });
      }
    }
  }

  // Tags the operations use but the description never declared, in first-use
  // order: a description that skipped its `tags` list still reads as sections.
  const seen = new Set(declaredTags.map((tag) => tag.name));
  for (const operation of operations) {
    for (const tag of operation.tags) {
      if (!seen.has(tag)) {
        seen.add(tag);
        declaredTags.push({ name: tag, description: "" });
      }
    }
  }

  return {
    description: {
      title: stringAt(info, "title") ?? "API",
      version: stringAt(info, "version") ?? "",
      description: stringAt(info, "description") ?? "",
      tags: declaredTags,
      operations,
    },
    problems,
  };
}
