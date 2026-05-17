import type { ActionErrorDefinition } from "./errors.js";
import type { InferSchemaOutput, SchemaLike } from "./schemas.js";

export type ActionResponseDefinitionValue = SchemaLike<any> | ActionErrorDefinition<any, any, any, any>;

export type ActionResponseDefinitions = Partial<Record<number, ActionResponseDefinitionValue>>;

export interface ActionResponse<TStatus extends number = number, TBody = unknown> {
  status: TStatus;
  body?: TBody;
  headers?: HeadersInit;
}

export type ActionHandlerResult<TStatus extends number = number, TBody = unknown> =
  | Response
  | ActionResponse<TStatus, TBody>;

type FallbackIfNever<TValue, TFallback> = [TValue] extends [never] ? TFallback : TValue;

type SuccessActionResponses<TResponses extends ActionResponseDefinitions> = {
  [TStatus in Extract<keyof TResponses, number>]: TResponses[TStatus] extends SchemaLike<any>
    ? ActionResponse<TStatus, InferSchemaOutput<TResponses[TStatus], never>>
    : never;
}[Extract<keyof TResponses, number>];

export type ActionContractResult<TResponses extends ActionResponseDefinitions | undefined = undefined> =
  | Response
  | ([TResponses] extends [undefined]
      ? ActionResponse
      : FallbackIfNever<SuccessActionResponses<NonNullable<TResponses>>, ActionResponse>);
