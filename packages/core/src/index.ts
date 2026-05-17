export const packageName = "@action-js/core";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export type MaybePromise<T> = T | Promise<T>;

export interface SchemaIssue {
  path: ReadonlyArray<string | number>;
  message: string;
}

export interface SchemaParseSuccess<TOutput> {
  success: true;
  data: TOutput;
}

export interface SchemaParseFailure {
  success: false;
  error: {
    issues: ReadonlyArray<SchemaIssue>;
  };
}

export type SchemaParseResult<TOutput> = SchemaParseSuccess<TOutput> | SchemaParseFailure;

export interface SchemaLike<TOutput = unknown> {
  safeParse(input: unknown): SchemaParseResult<TOutput>;
}

export type InferSchemaOutput<TSchema, TDefault> = TSchema extends SchemaLike<infer TOutput>
  ? TOutput
  : TDefault;

export type QueryValue = string | string[];

export type RawQuery = Record<string, QueryValue>;

type PathParamName<TSegment extends string> = TSegment extends `:${infer TParam}`
  ? TParam
  : never;

type PathParamNames<TPath extends string> = TPath extends `${infer THead}/${infer TTail}`
  ? PathParamName<THead> | PathParamNames<TTail>
  : PathParamName<TPath>;

export type PathParams<TPath extends string> = [PathParamNames<TPath>] extends [never]
  ? Record<string, never>
  : {
      [TKey in PathParamNames<TPath>]: string;
    };

export interface ActionContext<
  TPath extends string,
  TServices,
  TParamsSchema = undefined,
  TQuerySchema = undefined,
  TBodySchema = undefined,
> {
  request: Request;
  params: InferSchemaOutput<TParamsSchema, PathParams<TPath>>;
  query: InferSchemaOutput<TQuerySchema, RawQuery>;
  body: InferSchemaOutput<TBodySchema, unknown>;
  services: TServices;
}

export interface ActionResponse<TStatus extends number = number, TBody = unknown> {
  status: TStatus;
  body?: TBody;
  headers?: HeadersInit;
}

export type ActionHandlerResult<TStatus extends number = number, TBody = unknown> =
  | Response
  | ActionResponse<TStatus, TBody>;

export interface ActionDefinition<
  TMethod extends HttpMethod = HttpMethod,
  TPath extends string = string,
  TServices = Record<string, never>,
  TParamsSchema = undefined,
  TQuerySchema = undefined,
  TBodySchema = undefined,
  TResult extends ActionHandlerResult = ActionHandlerResult,
> {
  readonly kind: "action";
  readonly method: TMethod;
  readonly path: TPath;
  readonly params?: TParamsSchema | undefined;
  readonly query?: TQuerySchema | undefined;
  readonly body?: TBodySchema | undefined;
  readonly handler: (
    context: ActionContext<TPath, TServices, TParamsSchema, TQuerySchema, TBodySchema>,
  ) => MaybePromise<TResult>;
}

export interface ActionOptions<
  TMethod extends HttpMethod,
  TPath extends string,
  TServices,
  TParamsSchema,
  TQuerySchema,
  TBodySchema,
  TResult extends ActionHandlerResult,
> {
  method: TMethod;
  path: TPath;
  params?: TParamsSchema | undefined;
  query?: TQuerySchema | undefined;
  body?: TBodySchema | undefined;
  handler: (
    context: ActionContext<TPath, TServices, TParamsSchema, TQuerySchema, TBodySchema>,
  ) => MaybePromise<TResult>;
}

export function action<
  TMethod extends HttpMethod,
  TPath extends string,
  TServices = Record<string, never>,
  TParamsSchema = undefined,
  TQuerySchema = undefined,
  TBodySchema = undefined,
  TResult extends ActionHandlerResult = ActionHandlerResult,
>(
  options: ActionOptions<TMethod, TPath, TServices, TParamsSchema, TQuerySchema, TBodySchema, TResult>,
): ActionDefinition<TMethod, TPath, TServices, TParamsSchema, TQuerySchema, TBodySchema, TResult> {
  return {
    kind: "action",
    method: options.method,
    path: options.path,
    params: options.params,
    query: options.query,
    body: options.body,
    handler: options.handler,
  };
}
