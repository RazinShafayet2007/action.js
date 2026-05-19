export interface RequestLogEntry {
  level: "info" | "error";
  requestId?: string | undefined;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

export interface ActionLogger {
  info: (entry: RequestLogEntry) => void | Promise<void>;
  error: (entry: RequestLogEntry) => void | Promise<void>;
}

export function createDefaultLogger(): ActionLogger {
  return {
    info(entry) {
      console.log(JSON.stringify(entry));
    },
    error(entry) {
      console.error(JSON.stringify(entry));
    },
  };
}
