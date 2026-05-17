import type {
  ActionContractResult,
  ActionDefinition,
  ActionResponseDefinitions,
  HttpMethod,
  SchemaLike,
} from "@action-js/core";

export type AnySchema = SchemaLike<any> | undefined;

export type AnyActionDefinition<TServices> = ActionDefinition<
  HttpMethod,
  string,
  TServices,
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
