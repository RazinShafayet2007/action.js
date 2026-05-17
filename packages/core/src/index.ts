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

export interface ActionContext<TPath extends string, TServices> {
  request: Request;
  params: PathParams<TPath>;
  query: URLSearchParams;
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
  TResult extends ActionHandlerResult = ActionHandlerResult,
> {
  readonly kind: "action";
  readonly method: TMethod;
  readonly path: TPath;
  readonly handler: (context: ActionContext<TPath, TServices>) => MaybePromise<TResult>;
}

export interface ActionOptions<
  TMethod extends HttpMethod,
  TPath extends string,
  TServices,
  TResult extends ActionHandlerResult,
> {
  method: TMethod;
  path: TPath;
  handler: (context: ActionContext<TPath, TServices>) => MaybePromise<TResult>;
}

export function action<
  TMethod extends HttpMethod,
  TPath extends string,
  TServices = Record<string, never>,
  TResult extends ActionHandlerResult = ActionHandlerResult,
>(options: ActionOptions<TMethod, TPath, TServices, TResult>): ActionDefinition<TMethod, TPath, TServices, TResult> {
  return {
    kind: "action",
    method: options.method,
    path: options.path,
    handler: options.handler,
  };
}
