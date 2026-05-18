import type { ActionAppLike } from "./types.js";

export function resolveAppExport(value: unknown): ActionAppLike | null {
  const candidates = [
    value,
    getRecordProperty(value, "default"),
    getRecordProperty(value, "app"),
  ];

  for (const candidate of candidates) {
    if (isActionAppLike(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isActionAppLike(value: unknown): value is ActionAppLike {
  return typeof value === "object" && value !== null && Array.isArray((value as { actions?: unknown }).actions);
}

function getRecordProperty(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}
