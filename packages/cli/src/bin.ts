#!/usr/bin/env node
import { describeBuild, parseBuildOptions, runBuild } from "./build.js";
import {
  describeStartup,
  describeUpdate,
  discoverRoot,
  parseDevOptions,
  startDev,
} from "./dev.js";
import { exitCodes, run } from "./index.js";

/**
 * The binary.
 *
 * Everything it does is decided elsewhere: parsing, discovery and the startup
 * message are functions that return values, and this file is the only place
 * that touches the process. That is what lets the whole command be tested
 * without spawning one.
 */

const argv = process.argv.slice(2);

if (argv[0] === "build") {
  const parsed = parseBuildOptions(argv.slice(1));

  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`);
    process.exitCode = exitCodes.usage;
  } else {
    const discovered = await discoverRoot(parsed.options.root);

    if (!discovered.ok) {
      process.stderr.write(`${discovered.message}\n`);
      process.exitCode = exitCodes.usage;
    } else {
      try {
        const report = await runBuild({
          ...parsed.options,
          root: discovered.discovery.root,
        });
        process.stdout.write(`${describeBuild(report)}\n`);
      } catch (cause) {
        process.stderr.write(
          `${cause instanceof Error ? cause.message : String(cause)}\n`,
        );
        process.exitCode = exitCodes.startup;
      }
    }
  }
} else if (argv[0] === "dev") {
  const parsed = parseDevOptions(argv.slice(1));

  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`);
    process.exitCode = exitCodes.usage;
  } else {
    const discovered = await discoverRoot(parsed.options.root);

    if (!discovered.ok) {
      // A directory that is not there is a problem with the command rather than
      // with the machine: it is fixed by typing a different path.
      process.stderr.write(`${discovered.message}\n`);
      process.exitCode = exitCodes.usage;
    } else {
      const root = discovered.discovery.root;

      try {
        const result = await startDev({
          ...parsed.options,
          root,
          onUpdate: (summary) => {
            process.stdout.write(`${describeUpdate(summary)}\n`);
          },
          onUpdateFailed: (cause) => {
            // A rebuild that failed leaves the last good site being served, so
            // this is news rather than an emergency.
            process.stderr.write(
              `rebuild failed: ${cause instanceof Error ? cause.message : String(cause)}\n`,
            );
          },
        });
        process.stdout.write(`${describeStartup(result, root)}\n`);

        // Stop cleanly on the signals a terminal actually sends, so the port is
        // released rather than held until the process is killed.
        for (const signal of ["SIGINT", "SIGTERM"] as const) {
          process.once(signal, () => {
            void result.server.close().then(() => {
              process.exit(exitCodes.ok);
            });
          });
        }
      } catch (cause) {
        // Startup failures are already phrased as sentences by the server; a
        // stack trace here would bury the sentence.
        process.stderr.write(
          `${cause instanceof Error ? cause.message : String(cause)}\n`,
        );
        process.exitCode = exitCodes.startup;
      }
    }
  }
} else {
  const result = run(argv);

  if (result.stdout !== "") {
    process.stdout.write(result.stdout);
  }
  if (result.stderr !== "") {
    process.stderr.write(result.stderr);
  }

  // Setting exitCode instead of calling process.exit lets pending stdout
  // writes flush before the process terminates.
  process.exitCode = result.exitCode;
}
