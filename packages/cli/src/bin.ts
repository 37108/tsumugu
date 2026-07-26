#!/usr/bin/env node
import { run } from "./index.js";

const result = run(process.argv.slice(2));

if (result.stdout !== "") {
  process.stdout.write(result.stdout);
}
if (result.stderr !== "") {
  process.stderr.write(result.stderr);
}

// Setting exitCode instead of calling process.exit lets pending stdout writes
// flush before the process terminates.
process.exitCode = result.exitCode;
