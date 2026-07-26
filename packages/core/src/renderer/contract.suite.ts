import { findNodeProblems } from "../ast/validate.js";
import type { LoadedDocument } from "../document/document.js";
import type { Renderer } from "./contract.js";

/**
 * A reusable conformance suite for the renderer contract.
 *
 * Every renderer has to satisfy the same properties, and each one restating
 * them is how they drift. This produces the cases; the caller runs them with
 * whatever test framework it uses.
 *
 * It deliberately imports no test framework and no assertion library. A case
 * throws an `Error` when it fails, which every runner understands, so a
 * renderer package does not inherit a testing dependency from the contract it
 * implements.
 */

export interface ContractCase {
  readonly name: string;
  /**
   * Runs the case, throwing on failure.
   *
   * Synchronous cases stay synchronous; the caller awaits either way.
   */
  run(): void | Promise<void>;
}

export interface ContractSamples {
  /** Documents this renderer is expected to claim and parse. */
  readonly supported: readonly LoadedDocument[];
  /** Documents this renderer must decline. */
  readonly unsupported: readonly LoadedDocument[];
}

function fail(message: string): never {
  throw new Error(message);
}

/** Structural equality for plain trees, which is all an AST contains. */
function sameTree(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Builds the conformance cases for a renderer.
 *
 * @param renderer The renderer under test.
 * @param samples Documents it should and should not claim. At least one of
 *   each is required: a suite with no samples would pass without testing
 *   anything, which is worse than no suite.
 */
export function rendererContractCases(
  renderer: Renderer,
  samples: ContractSamples,
): ContractCase[] {
  const cases: ContractCase[] = [
    {
      name: "declares a non-empty identifier",
      run: () => {
        if (typeof renderer.id !== "string" || renderer.id === "") {
          fail(
            "A renderer must declare a non-empty id; it names the renderer in diagnostics.",
          );
        }
      },
    },
    {
      name: "is given at least one supported and one unsupported sample",
      run: () => {
        if (samples.supported.length === 0) {
          fail(
            "The contract suite needs at least one supported sample, or it passes without testing anything.",
          );
        }
        if (samples.unsupported.length === 0) {
          fail(
            "The contract suite needs at least one unsupported sample, or a renderer claiming everything would pass.",
          );
        }
      },
    },
  ];

  for (const document of samples.unsupported) {
    cases.push({
      name: `declines ${document.sourcePath}`,
      run: () => {
        if (renderer.supports(document)) {
          fail(
            `"${renderer.id}" claims "${document.sourcePath}", which the suite lists as unsupported. A renderer that claims too much makes selection ambiguous.`,
          );
        }
      },
    });
  }

  for (const document of samples.supported) {
    const where = `"${renderer.id}" on "${document.sourcePath}"`;

    cases.push(
      {
        name: `claims ${document.sourcePath}`,
        run: () => {
          if (!renderer.supports(document)) {
            fail(`${where}: expected supports() to return true.`);
          }
        },
      },
      {
        name: `answers supports() the same way twice for ${document.sourcePath}`,
        run: () => {
          // supports() is called for every registered renderer on every
          // document, so a stateful one makes selection depend on order.
          if (renderer.supports(document) !== renderer.supports(document)) {
            fail(`${where}: supports() must be free of side effects.`);
          }
        },
      },
      {
        name: `returns a document root for ${document.sourcePath}`,
        run: async () => {
          const result = await renderer.render(document);
          if (result.root.type !== "document") {
            fail(
              `${where}: render() must return a tree rooted at a "document" node.`,
            );
          }
        },
      },
      {
        name: `returns a structurally valid tree for ${document.sourcePath}`,
        run: async () => {
          const result = await renderer.render(document);
          const problems = findNodeProblems(result.root);
          if (problems.length > 0) {
            fail(
              `${where}: produced an invalid tree:\n${problems
                .map((problem) => `  ${problem.path}: ${problem.message}`)
                .join("\n")}`,
            );
          }
        },
      },
      {
        name: `renders ${document.sourcePath} deterministically`,
        run: async () => {
          // Caching and incremental rebuilds are unsound without this: the
          // same input must produce the same tree, or a cached page and a
          // fresh one can disagree.
          const first = await renderer.render(document);
          const second = await renderer.render(document);
          if (!sameTree(first.root, second.root)) {
            fail(
              `${where}: render() produced different trees for the same input.`,
            );
          }
        },
      },
      {
        name: `does not modify the document it was given for ${document.sourcePath}`,
        run: async () => {
          const before = JSON.stringify(document);
          await renderer.render(document);
          if (JSON.stringify(document) !== before) {
            fail(
              `${where}: render() modified its input. Documents are immutable.`,
            );
          }
        },
      },
      {
        name: `reports only well-formed diagnostics for ${document.sourcePath}`,
        run: async () => {
          const result = await renderer.render(document);
          for (const diagnostic of result.diagnostics ?? []) {
            if (diagnostic.code === "" || diagnostic.message === "") {
              fail(`${where}: a diagnostic must carry a code and a message.`);
            }
            if (
              diagnostic.severity !== "warning" &&
              diagnostic.severity !== "error"
            ) {
              fail(
                `${where}: unknown diagnostic severity "${String(diagnostic.severity)}".`,
              );
            }
          }
        },
      },
    );
  }

  return cases;
}
