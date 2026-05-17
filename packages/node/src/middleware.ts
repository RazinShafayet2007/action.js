import type { MaybePromise } from "@action-js/core";

export interface RequestIdMiddlewareOptions {
  generator?: (() => string) | undefined;
  headerName?: string | undefined;
}

export type MiddlewareContext<TServices, TContext extends object, TExtension extends object = {}> = TContext & {
  request: Request;
  services: TServices;
  setContext: (extension: TExtension) => void;
};

export type MiddlewareHandler<TServices, TContext extends object, TExtension extends object = {}> = (
  context: MiddlewareContext<TServices, TContext, TExtension>,
  next: () => Promise<Response>,
) => MaybePromise<Response>;

export function requestId<TServices, TContext extends object = {}>(
  options: RequestIdMiddlewareOptions = {},
): MiddlewareHandler<TServices, TContext, { requestId: string }> {
  const headerName = options.headerName ?? "x-request-id";
  const generator = options.generator ?? defaultRequestIdGenerator;

  return async (context, next) => {
    const existingRequestId = context.request.headers.get(headerName);
    const requestId = existingRequestId ?? generator();

    context.setContext({ requestId });

    const response = await next();
    response.headers.set(headerName, requestId);

    return response;
  };
}

function defaultRequestIdGenerator(): string {
  return crypto.randomUUID();
}
