import { parse as parseYaml } from "yaml";

import type {
  BlockNode,
  DocumentDiagnostic,
  DocumentNode,
  InlineNode,
  LoadedDocument,
  RenderResult,
  Renderer,
  TableNode,
  TableRowNode,
} from "tsumugu-core";

import type {
  ApiDescription,
  JsonValue,
  Operation,
  Parameter,
  Response,
} from "./document.js";
import { readDescription } from "./read.js";

/**
 * An API description, as a document.
 *
 * A description is the durable source for an HTTP interface, the same way HTML
 * is a durable source for a page. Rendering it here rather than embedding a
 * viewer is what lets an operation have an address, appear in the sidebar, and
 * turn up in search, `documents.json` and `llms.txt` like any other section —
 * without a line of JavaScript reaching the reader.
 *
 * The structure is the description's own: `info.title` names the page, each tag
 * is a section, and each operation is a subsection headed by its method and
 * path. Nothing is invented, and nothing is grouped by a rule the description
 * did not state; an operation with no tag lands in a section at the end rather
 * than disappearing.
 *
 * Which files this claims is core's decision, not this package's: a description
 * is claimed by name (ADR 10), so `api.openapi.yaml` is a page and `data.yaml`
 * is a file served beside the documents.
 */

export const openApiCodes = {
  /** The file could not be parsed as YAML or JSON. */
  unparsable: "renderer-openapi/unparsable",
  /** The description was read, but something in it could not be. */
  incomplete: "renderer-openapi/incomplete",
} as const;

export interface OpenApiOptions {
  /**
   * Heading depth the description's own title takes.
   *
   * A description rendered as a whole page wants `1`, which is the default. A
   * project that composes several descriptions into one page passes `2`.
   */
  readonly titleDepth?: 1 | 2;
}

function text(value: string): InlineNode {
  return { type: "text", value };
}

function paragraph(value: string): BlockNode {
  return { type: "paragraph", children: [text(value)] };
}

function code(value: string): InlineNode {
  return { type: "inline-code", value };
}

function row(cells: readonly InlineNode[][], header: boolean): TableRowNode {
  return {
    type: "table-row",
    header,
    children: cells.map((children) => ({ type: "table-cell", children })),
  };
}

function table(
  headings: readonly string[],
  rows: readonly (readonly InlineNode[][])[],
): TableNode {
  return {
    type: "table",
    align: headings.map(() => undefined),
    children: [
      row(
        headings.map((heading) => [text(heading)]),
        true,
      ),
      ...rows.map((cells) => row(cells, false)),
    ],
  };
}

function parameterRows(
  parameters: readonly Parameter[],
): readonly (readonly InlineNode[][])[] {
  return parameters.map((parameter) => [
    [code(parameter.name)],
    [text(parameter.location)],
    parameter.type === "" ? [] : [code(parameter.type)],
    [text(parameter.required ? "Required" : "Optional")],
    [text(parameter.description)],
  ]);
}

function responseRows(
  responses: readonly Response[],
): readonly (readonly InlineNode[][])[] {
  return responses.map((response) => [
    [code(response.status)],
    [text(response.description)],
    response.contentTypes.length === 0
      ? []
      : [code(response.contentTypes.join(", "))],
  ]);
}

/** One operation: its heading, its prose, and its tables. */
function operationNodes(operation: Operation): BlockNode[] {
  const nodes: BlockNode[] = [
    {
      type: "heading",
      depth: 3,
      children: [
        text(`${operation.method.toUpperCase()} `),
        code(operation.path),
      ],
    },
  ];

  if (operation.deprecated) {
    nodes.push({
      type: "blockquote",
      children: [paragraph("Deprecated.")],
    });
  }
  if (operation.summary !== "") {
    nodes.push(paragraph(operation.summary));
  }
  if (
    operation.description !== "" &&
    operation.description !== operation.summary
  ) {
    nodes.push(paragraph(operation.description));
  }

  if (operation.parameters.length > 0) {
    nodes.push(
      { type: "heading", depth: 4, children: [text("Parameters")] },
      table(
        ["Name", "In", "Type", "Required", "Description"],
        parameterRows(operation.parameters),
      ),
    );
  }

  const body = operation.requestBody;
  if (body !== undefined) {
    nodes.push({
      type: "heading",
      depth: 4,
      children: [text("Request body")],
    });
    const said = [
      body.required ? "Required." : "Optional.",
      body.description,
      body.contentTypes.length === 0
        ? ""
        : `Content type: ${body.contentTypes.join(", ")}.`,
    ]
      .filter((part) => part !== "")
      .join(" ");
    nodes.push(paragraph(said));
    if (body.schema !== undefined && body.schema !== "") {
      nodes.push({
        type: "code-block",
        value: body.schema,
        language: "json",
      });
    }
  }

  if (operation.responses.length > 0) {
    nodes.push(
      { type: "heading", depth: 4, children: [text("Responses")] },
      table(
        ["Status", "Description", "Content type"],
        responseRows(operation.responses),
      ),
    );
  }

  return nodes;
}

/** The whole description, as one document. */
function toDocument(
  description: ApiDescription,
  titleDepth: 1 | 2,
): DocumentNode {
  const children: BlockNode[] = [
    {
      type: "heading",
      depth: titleDepth,
      children: [text(description.title)],
    },
  ];

  if (description.version !== "") {
    children.push(paragraph(`Version ${description.version}.`));
  }
  if (description.description !== "") {
    children.push(paragraph(description.description));
  }

  const untagged = description.operations.filter(
    (operation) => operation.tags.length === 0,
  );

  for (const tag of description.tags) {
    const operations = description.operations.filter((operation) =>
      operation.tags.includes(tag.name),
    );
    if (operations.length === 0) {
      continue;
    }
    children.push({ type: "heading", depth: 2, children: [text(tag.name)] });
    if (tag.description !== "") {
      children.push(paragraph(tag.description));
    }
    for (const operation of operations) {
      children.push(...operationNodes(operation));
    }
  }

  if (untagged.length > 0) {
    // Last, and never dropped: an operation the description did not file under
    // a tag is still an operation somebody has to call.
    children.push({
      type: "heading",
      depth: 2,
      children: [text("Other operations")],
    });
    for (const operation of untagged) {
      children.push(...operationNodes(operation));
    }
  }

  if (description.operations.length === 0) {
    children.push(paragraph("This description contains no operations."));
  }

  return { type: "document", children };
}

/**
 * Creates the renderer.
 *
 * A description that cannot be parsed still produces a page: its heading is the
 * file name and its body says what went wrong. Refusing to serve it would take
 * away the one thing that tells an author where to look.
 */
export function createOpenApiRenderer(options: OpenApiOptions = {}): Renderer {
  const titleDepth = options.titleDepth ?? 1;

  return {
    id: "openapi",

    supports: (document: LoadedDocument): boolean =>
      document.format === "openapi",

    render: (document: LoadedDocument): RenderResult => {
      const diagnostics: DocumentDiagnostic[] = [];
      let parsed: JsonValue;

      try {
        parsed = parseYaml(document.content) as JsonValue;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return {
          root: {
            type: "document",
            children: [
              {
                type: "heading",
                depth: titleDepth,
                children: [text(document.sourcePath)],
              },
              paragraph(`This description could not be read: ${message}`),
            ],
          },
          diagnostics: [
            {
              code: openApiCodes.unparsable,
              severity: "warning",
              stage: "renderer",
              message: `${document.sourcePath} is not valid YAML or JSON: ${message}`,
              sourcePath: document.sourcePath,
            },
          ],
        };
      }

      const { description, problems } = readDescription(parsed);

      for (const problem of problems) {
        diagnostics.push({
          code: openApiCodes.incomplete,
          severity: "warning",
          stage: "renderer",
          message: problem.message,
          ...(problem.hint === undefined ? {} : { hint: problem.hint }),
          sourcePath: document.sourcePath,
        });
      }

      if (description === undefined) {
        return {
          root: {
            type: "document",
            children: [
              {
                type: "heading",
                depth: titleDepth,
                children: [text(document.sourcePath)],
              },
              paragraph(
                problems[0]?.message ?? "This description could not be read.",
              ),
            ],
          },
          diagnostics,
        };
      }

      return {
        root: toDocument(description, titleDepth),
        diagnostics,
        // Reported rather than resolved: which of front matter, a heading or a
        // file name wins is a shared rule, and a renderer that decided it would
        // be reimplementing precedence per format.
        metadata: [
          ["title", description.title],
          ...(description.description === ""
            ? []
            : ([["description", description.description]] as const)),
        ],
      };
    },
  };
}
