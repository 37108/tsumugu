import { version } from "@tsumugu/core";

/**
 * The outcome of a CLI invocation.
 *
 * `run` returns this instead of writing to the process streams so that command
 * behaviour can be tested without spawning a child process.
 */
export interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

const usage = `Usage: tsumugu --version

No documentation commands are implemented yet.
`;

/**
 * Executes a CLI invocation.
 *
 * @param argv Arguments after the node executable and script path, i.e.
 *   `process.argv.slice(2)`.
 */
export function run(argv: readonly string[]): CliResult {
  const first = argv[0];

  if (argv.length === 1 && (first === "--version" || first === "-v")) {
    return { stdout: `tsumugu ${version}\n`, stderr: "", exitCode: 0 };
  }

  return { stdout: "", stderr: usage, exitCode: 1 };
}
