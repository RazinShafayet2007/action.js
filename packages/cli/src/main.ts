import { resolve } from "node:path";

import { runOpenApiCommand } from "./commands/openapi.js";
import { defaultCliIo, writeErrorLine, writeLine } from "./io.js";
import type { RunCliOptions } from "./types.js";

export async function runCli(args: string[], options: RunCliOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const io = options.io ?? defaultCliIo;
  const [command, ...commandArgs] = args;

  if (command === undefined || command === "--help" || command === "help") {
    printHelp(io);
    return 0;
  }

  try {
    switch (command) {
      case "openapi":
        return await runOpenApiCommand(commandArgs, cwd, io);
      default:
        writeErrorLine(io, `Unknown command: ${command}`);
        printHelp(io);
        return 1;
    }
  } catch (error) {
    writeErrorLine(io, error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function printHelp(io: RunCliOptions["io"] extends infer T ? NonNullable<T> : never): void {
  writeLine(io, "Action.js CLI");
  writeLine(io, "");
  writeLine(io, "Commands:");
  writeLine(io, "  action openapi [--app <path>] [--output <path>] [--pretty] [--title <title>] [--version <version>]");
}
