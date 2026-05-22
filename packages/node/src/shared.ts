import type {
  ActionContractResult,
  ActionDefinition,
  ActionResponseDefinitions,
  HttpMethod,
  SchemaLike,
} from "@action-js/core";

export type ContextValues = Record<string, unknown>;

export type AnySchema = SchemaLike<any> | undefined;

export type AnyActionDefinition<TServices, TContext extends object = {}> = ActionDefinition<
  HttpMethod,
  string,
  TServices,
  TContext,
  AnySchema,
  AnySchema,
  AnySchema,
  ActionResponseDefinitions | undefined,
  ActionContractResult<ActionResponseDefinitions | undefined>
>;

export function isWebhookActionDefinition(value: unknown): value is AnyActionDefinition<any, any> & {
  webhook: true;
  verify?: ((context: any) => Promise<void> | void) | undefined;
} {
  return typeof value === "object" && value !== null && (value as { webhook?: unknown }).webhook === true;
}

export type ValidationResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      response: Response;
    };
