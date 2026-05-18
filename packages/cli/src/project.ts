import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface ProjectMetadata {
  title: string;
  version: string;
}

const DEFAULT_APP_CANDIDATES = ["src/app.ts", "src/app.js", "app.ts", "app.js"];

export async function resolveDefaultAppPath(cwd: string): Promise<string> {
  for (const candidate of DEFAULT_APP_CANDIDATES) {
    const fullPath = resolve(cwd, candidate);

    try {
      await access(fullPath);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("Could not find an app module. Pass one explicitly with --app <path>.");
}

export async function readProjectMetadata(cwd: string): Promise<ProjectMetadata> {
  const packageJsonPath = resolve(cwd, "package.json");

  try {
    const contents = await readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(contents) as {
      name?: string;
      version?: string;
    };

    return {
      title: packageJson.name ?? "Action.js API",
      version: packageJson.version ?? "0.0.0",
    };
  } catch {
    return {
      title: "Action.js API",
      version: "0.0.0",
    };
  }
}
