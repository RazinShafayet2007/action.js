import type { PathParams } from "./path-params.js";
import type { ActionContractResult, ActionResponseDefinitions } from "./responses.js";
import type { InferSchemaOutput, RawQuery } from "./schemas.js";
import type { HttpMethod, MaybePromise } from "./types.js";

export type ActionContext<
  TPath extends string,
  TServices,
  TContext extends object = {},
  TParamsSchema = undefined,
  TQuerySchema = undefined,
  TBodySchema = undefined,
> = TContext & {
  request: Request;
  params: InferSchemaOutput<TParamsSchema, PathParams<TPath>>;
  query: InferSchemaOutput<TQuerySchema, RawQuery>;
  body: InferSchemaOutput<TBodySchema, unknown>;
  services: TServices;
};

export interface ActionDefinition<
  TMethod extends HttpMethod = HttpMethod,
  TPath extends string = string,
  TServices = Record<string, never>,
  TContext extends object = {},
  TParamsSchema = undefined,
  TQuerySchema = undefined,
  TBodySchema = undefined,
  TResponses extends ActionResponseDefinitions | undefined = undefined,
  TResult extends ActionContractResult<TResponses> = ActionContractResult<TResponses>,
> {
  readonly kind: "action";
  readonly method: TMethod;
  readonly path: TPath;
  readonly params?: TParamsSchema | undefined;
  readonly query?: TQuerySchema | undefined;
  readonly body?: TBodySchema | undefined;
  readonly response?: TResponses | undefined;
  readonly handler: (
    context: ActionContext<TPath, TServices, TContext, TParamsSchema, TQuerySchema, TBodySchema>,
  ) => MaybePromise<TResult>;
}

export interface ActionOptions<
  TMethod extends HttpMethod,
  TPath extends string,
  TServices,
  TContext extends object,
  TParamsSchema,
  TQuerySchema,
  TBodySchema,
  TResponses extends ActionResponseDefinitions | undefined,
  TResult extends ActionContractResult<TResponses>,
> {
  method: TMethod;
  path: TPath;
  params?: TParamsSchema | undefined;
  query?: TQuerySchema | undefined;
  body?: TBodySchema | undefined;
  response?: TResponses | undefined;
  handler: (
    context: ActionContext<TPath, TServices, TContext, TParamsSchema, TQuerySchema, TBodySchema>,
  ) => MaybePromise<TResult>;
}

export function action<
  TMethod extends HttpMethod,
  TPath extends string,
  TServices = Record<string, never>,
  TContext extends object = {},
  TParamsSchema = undefined,
  TQuerySchema = undefined,
  TBodySchema = undefined,
  TResponses extends ActionResponseDefinitions | undefined = undefined,
  TResult extends ActionContractResult<TResponses> = ActionContractResult<TResponses>,
>(
  options: ActionOptions<
    TMethod,
    TPath,
    TServices,
    TContext,
    TParamsSchema,
    TQuerySchema,
    TBodySchema,
    TResponses,
    TResult
  >,
): ActionDefinition<TMethod, TPath, TServices, TContext, TParamsSchema, TQuerySchema, TBodySchema, TResponses, TResult> {
  return {
    kind: "action",
    method: options.method,
    path: options.path,
    params: options.params,
    query: options.query,
    body: options.body,
    response: options.response,
    handler: options.handler,
  };
}
