import type { ActionDefinition, HttpMethod } from "@action-js/core";

export type AnyAction = ActionDefinition<HttpMethod, string, any, any, any, any, any, any, any>;

export interface ActionAppLike {
  actions: ReadonlyArray<AnyAction>;
}

export interface CliIo {
  stdout: {
    write: (message: string) => void;
  };
  stderr: {
    write: (message: string) => void;
  };
}

export interface RunCliOptions {
  cwd?: string | undefined;
  io?: CliIo | undefined;
}
