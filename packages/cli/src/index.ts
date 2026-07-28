import { version } from "tsumugu-core";

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

/**
 * Exit codes, fixed so a script can branch on them.
 *
 * They separate "you asked for something impossible" from "I could not do what
 * you asked": the first is fixed by editing the command, the second by fixing
 * the machine or the project. A caller that cannot tell them apart retries the
 * one that will never succeed.
 */
export const exitCodes = {
  ok: 0,
  /** The command line could not be understood. */
  usage: 1,
  /** The command was valid, but the server could not start. */
  startup: 2,
} as const;

/**
 * Help output.
 *
 * It describes what exists today and says nothing about what is planned. A help
 * screen listing commands that do not work is a help screen nobody trusts
 * twice.
 */
export const usage = `tsumugu: a documentation server for plain files

Usage
  tsumugu dev [directory] [options]     serve documentation on localhost
  tsumugu build [directory] [options]   write the site to a directory
  tsumugu --version                     print the version
  tsumugu --help                        print this message

Options for dev
  --root <directory>   directory to serve, the same as the positional argument
  --host <host>        interface to bind (default: 127.0.0.1, loopback only)
  --port <port>        port to bind, 0 for any free port (default: 0)

Options for build
  --root <directory>   directory to build, the same as the positional argument
  --out <directory>    where to write (default: ./dist)
  --origin <url>       where the site will be published, for sitemap.xml
  --clean              remove the output directory even if tsumugu did not write it

Without a directory, tsumugu serves ./docs, or the current directory when it
contains an index document. Files are watched while dev runs: save a document
and reload the page.
`;

/**
 * Executes a CLI invocation that does not start a server.
 *
 * `dev` is handled by the binary instead, because it is asynchronous and does
 * not end; everything here returns a result and exits.
 *
 * @param argv Arguments after the node executable and script path, i.e.
 *   `process.argv.slice(2)`.
 */
export function run(argv: readonly string[]): CliResult {
  const first = argv[0];

  if (argv.length === 1 && (first === "--version" || first === "-v")) {
    return {
      stdout: `tsumugu ${version}\n`,
      stderr: "",
      exitCode: exitCodes.ok,
    };
  }

  if (argv.length === 1 && (first === "--help" || first === "-h")) {
    // Asking for help is not a failure, so it goes to stdout and exits zero.
    return { stdout: usage, stderr: "", exitCode: exitCodes.ok };
  }

  return { stdout: "", stderr: usage, exitCode: exitCodes.usage };
}

export {
  describeBuild,
  parseBuildOptions,
  runBuild,
  type BuildCommandOptions,
} from "./build.js";
export {
  formatForTerminal,
  styleFor,
  type ColourOptions,
  type TerminalStyle,
} from "./terminal.js";
export {
  describeStartup,
  describeUpdate,
  describeUpdateFailure,
  discoverRoot,
  parseDevOptions,
  siteNameFor,
  startDev,
  type DevOptions,
  type DevResult,
  type RootDiscovery,
} from "./dev.js";
