import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { writeLine } from "../io.js";
import { readProjectMetadata, resolveDefaultAppPath } from "../project.js";
import type { CliIo } from "../types.js";

const execFileAsync = promisify(execFile);

export interface OpenApiCommandOptions {
  app?: string | undefined;
  output?: string | undefined;
  pretty: boolean;
  title?: string | undefined;
  version?: string | undefined;
}

export async function runOpenApiCommand(args: string[], cwd: string, io: CliIo): Promise<number> {
  const options = parseOpenApiArgs(args);
  const appPath = options.app ?? (await resolveDefaultAppPath(cwd));
  const outputPath = options.output ?? "openapi.json";
  const projectMetadata = await readProjectMetadata(cwd);
  const info = {
    title: options.title ?? projectMetadata.title,
    version: options.version ?? projectMetadata.version,
  };
  const document = await generateOpenApiDocument(resolve(cwd, appPath), info);
  const serialized = JSON.stringify(document, null, options.pretty ? 2 : undefined);
  const resolvedOutputPath = resolve(cwd, outputPath);

  await mkdir(dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, serialized);

  writeLine(io, `Wrote OpenAPI document to ${outputPath}`);

  return 0;
}

async function generateOpenApiDocument(
  appPath: string,
  info: { title: string; version: string },
): Promise<unknown> {
  const workerPath = resolveWorkerPath();
  const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", workerPath, appPath, JSON.stringify(info)]);

  return JSON.parse(stdout);
}

function parseOpenApiArgs(args: string[]): OpenApiCommandOptions {
  const options: OpenApiCommandOptions = {
    pretty: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--pretty") {
      options.pretty = true;
      continue;
    }

    const nextValue = args[index + 1];

    if (nextValue === undefined) {
      throw new Error(`Missing value for ${argument}`);
    }

    switch (argument) {
      case "--app":
        options.app = nextValue;
        break;
      case "--output":
        options.output = nextValue;
        break;
      case "--title":
        options.title = nextValue;
        break;
      case "--version":
        options.version = nextValue;
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }

    index += 1;
  }

  return options;
}

function resolveWorkerPath(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentExtension = extname(currentFilePath);

  return fileURLToPath(new URL(`../openapi-worker${currentExtension}`, import.meta.url));
}
