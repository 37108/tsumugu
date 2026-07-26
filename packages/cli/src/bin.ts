#!/usr/bin/env node
import path from "node:path";

import { parseDevOptions, describeStartup, startDev } from "./dev.js";
import { run } from "./index.js";

const argv = process.argv.slice(2);

if (argv[0] === "dev") {
  const parsed = parseDevOptions(argv.slice(1));

  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`);
    process.exitCode = 1;
  } else {
    const root = path.resolve(parsed.options.root ?? "docs");
    try {
      const result = await startDev(parsed.options);
      process.stdout.write(`${describeStartup(result, root)}\n`);

      // Stop cleanly on the signals a terminal actually sends, so the port is
      // released rather than held until the process is killed.
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.once(signal, () => {
          void result.server.close().then(() => {
            process.exit(0);
          });
        });
      }
    } catch (cause) {
      // Startup failures are already phrased as sentences by the server; a
      // stack trace here would bury the sentence.
      process.stderr.write(
        `${cause instanceof Error ? cause.message : String(cause)}\n`,
      );
      process.exitCode = 1;
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
