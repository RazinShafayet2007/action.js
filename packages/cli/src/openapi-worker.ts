import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createOpenApiDocument } from "@action-js/openapi";

import { resolveAppExport } from "./app-export.js";

const [appPath, infoJson] = process.argv.slice(2);

if (!appPath || !infoJson) {
  throw new Error("OpenAPI worker requires an app path and info payload.");
}

const appModule = await import(pathToFileURL(resolve(appPath)).href);
const app = resolveAppExport(appModule);

if (!app) {
  throw new Error(`Could not find an exported Action.js app in ${appPath}.`);
}

const info = JSON.parse(infoJson) as {
  title: string;
  version: string;
};

const document = createOpenApiDocument({
  info,
  actions: app.actions,
});

process.stdout.write(JSON.stringify(document));
