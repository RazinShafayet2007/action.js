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

export type ValidationResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      response: Response;
    };
