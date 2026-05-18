import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveActionsExport } from "./actions-export.js";

const [appPath, exportName] = process.argv.slice(2);

if (!appPath || !exportName) {
  throw new Error("Client worker requires an app path and actions export name.");
}

const appModule = await import(pathToFileURL(resolve(appPath)).href);
const actions = resolveActionsExport(appModule, exportName);

if (!actions) {
  throw new Error(
    `Could not find a named '${exportName}' action tree export in ${appPath}. Export a nested object of action definitions for client generation.`,
  );
}

process.stdout.write(JSON.stringify({ exportName }));
