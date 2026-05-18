#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { runCli } from "./main.js";

export const packageName = "@action-js/cli";

export * from "./main.js";

const entryFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] === entryFilePath) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
