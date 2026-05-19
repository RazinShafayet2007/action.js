import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { runCli } from "./main.js";

describe("runCli", () => {
  it("generates an OpenAPI document from a TypeScript app module", async () => {
    const cwd = await mkdtemp(join(process.cwd(), ".tmp-cli-"));
    const srcDir = join(cwd, "src");
    const outputPath = join(cwd, "generated", "openapi.json");
    const stdout: string[] = [];
    const stderr: string[] = [];

    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(cwd, "package.json"),
      JSON.stringify({ name: "Example API", version: "1.2.3" }, null, 2),
    );
    await writeFile(
      join(srcDir, "app.ts"),
      `import { action } from "@action-js/core";
import { createActionApp } from "@action-js/node";
import { z } from "zod";

const app = createActionApp().action(
  action({
    method: "GET",
    path: "/users/:id",
    params: z.object({ id: z.string() }),
    response: {
      200: z.object({ id: z.string() })
    },
    handler: ({ params }) => ({
      status: 200,
      body: { id: params.id }
    })
  })
);

export default app;
`,
    );

    const exitCode = await runCli(["openapi", "--app", "src/app.ts", "--output", "generated/openapi.json", "--pretty"], {
      cwd,
      io: {
        stdout: {
          write(message) {
            stdout.push(message);
          },
        },
        stderr: {
          write(message) {
            stderr.push(message);
          },
        },
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("")).toContain("Wrote OpenAPI document to generated/openapi.json");

    const document = JSON.parse(await readFile(outputPath, "utf8")) as {
      info: { title: string; version: string };
      paths: Record<string, { get: { responses: Record<string, unknown> } }>;
    };

    expect(document.info).toEqual({
      title: "Example API",
      version: "1.2.3",
    });
    expect(document.paths["/users/{id}"].get.responses["200"]).toBeDefined();
  }, 15000);

  it("uses default app discovery and explicit title/version overrides", async () => {
    const cwd = await mkdtemp(join(process.cwd(), ".tmp-cli-"));
    const srcDir = join(cwd, "src");
    const outputPath = join(cwd, "openapi.json");

    await mkdir(srcDir, { recursive: true });
    await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "Ignored", version: "0.0.1" }, null, 2));
    await writeFile(
      join(srcDir, "app.ts"),
      `import { action } from "@action-js/core";
import { createActionApp } from "@action-js/node";

export const app = createActionApp().action(
  action({
    method: "GET",
    path: "/health",
    handler: () => ({ status: 200, body: { ok: true } })
  })
);
`,
    );

    const exitCode = await runCli(["openapi", "--title", "Custom API", "--version", "9.9.9"], { cwd });

    expect(exitCode).toBe(0);

    const document = JSON.parse(await readFile(outputPath, "utf8")) as {
      info: { title: string; version: string };
      paths: Record<string, { get: unknown }>;
    };

    expect(document.info).toEqual({
      title: "Custom API",
      version: "9.9.9",
    });
    expect(document.paths["/health"].get).toBeDefined();
  }, 15000);

  it("generates a typed client module from a named action tree export", async () => {
    const cwd = await mkdtemp(join(process.cwd(), ".tmp-cli-"));
    const srcDir = join(cwd, "src");
    const outputPath = join(cwd, "src", "generated", "client.ts");

    await mkdir(srcDir, { recursive: true });
    await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "Client Fixture", version: "0.0.1" }, null, 2));
    await writeFile(
      join(srcDir, "app.ts"),
      `import { action } from "@action-js/core";
import { createActionApp } from "@action-js/node";
import { z } from "zod";

export const actions = {
  users: {
    get: action({
      method: "GET",
      path: "/users/:id",
      params: z.object({ id: z.string() }),
      response: {
        200: z.object({ id: z.string() })
      },
      handler: ({ params }) => ({
        status: 200,
        body: { id: params.id }
      })
    })
  }
};

export default createActionApp().action(actions.users.get);
`,
    );

    const exitCode = await runCli([
      "generate",
      "client",
      "--app",
      "src/app.ts",
      "--output",
      "src/generated/client.ts",
      "--export-name",
      "createSdk",
    ], {
      cwd,
    });

    expect(exitCode).toBe(0);

    const generated = await readFile(outputPath, "utf8");

    expect(generated).toContain('import { actions } from "../app.js";');
    expect(generated).toContain("export function createSdk(");
    expect(generated).toContain("export type ApiClient = ClientFromTree<typeof actions>;");
  }, 15000);
});

afterAll(async () => {
  const rootEntries = await readDirSafe(process.cwd());

  await Promise.all(
    rootEntries
      .filter((entry) => entry.startsWith(".tmp-cli-"))
      .map((entry) => rm(join(process.cwd(), entry), { recursive: true, force: true })),
  );
});

async function readDirSafe(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}
