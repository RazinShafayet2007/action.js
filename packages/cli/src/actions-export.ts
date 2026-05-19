import type { ClientActionTree } from "@action-js/client";

export function resolveActionsExport(value: unknown, exportName: string): ClientActionTree | null {
  return isActionTree(getRecordProperty(value, exportName)) ? (getRecordProperty(value, exportName) as ClientActionTree) : null;
}

function isActionTree(value: unknown): value is ClientActionTree {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entries = Object.values(value as Record<string, unknown>);

  return entries.length > 0 && entries.every((entry) => isActionDefinition(entry) || isActionTree(entry));
}

function isActionDefinition(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "action";
}

function getRecordProperty(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}
