import { runGenerateClientCommand } from "./commands/generate-client.js";
import { runOpenApiCommand } from "./commands/openapi.js";
import { defaultCliIo, writeErrorLine, writeLine } from "./io.js";
import type { RunCliOptions } from "./types.js";

export async function runCli(args: string[], options: RunCliOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const io = options.io ?? defaultCliIo;
  const [command, ...commandArgs] = args;
  const [subcommand, ...subcommandArgs] = commandArgs;

  if (command === undefined || command === "--help" || command === "help") {
    printHelp(io);
    return 0;
  }

  try {
    switch (command) {
      case "openapi":
        return await runOpenApiCommand(commandArgs, cwd, io);
      case "generate":
        if (subcommand === "client") {
          return await runGenerateClientCommand(subcommandArgs, cwd, io);
        }

        throw new Error(`Unknown generate target: ${subcommand ?? "<missing>"}`);
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
  writeLine(io, "  action generate client [--app <path>] [--output <path>] [--actions-export <name>] [--export-name <name>]");
}
