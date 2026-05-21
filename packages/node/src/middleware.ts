import type { MaybePromise } from "@action-js/core";

export interface RequestIdMiddlewareOptions {
  generator?: (() => string) | undefined;
  headerName?: string | undefined;
}

export interface CorsOptions {
  origin?: true | string | ReadonlyArray<string> | ((origin: string | null) => boolean | string | null) | undefined;
  methods?: ReadonlyArray<string> | undefined;
  allowedHeaders?: ReadonlyArray<string> | undefined;
  exposedHeaders?: ReadonlyArray<string> | undefined;
  credentials?: boolean | undefined;
  maxAge?: number | undefined;
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

export function cors<TServices, TContext extends object = {}>(
  options: CorsOptions = {},
): MiddlewareHandler<TServices, TContext> {
  const methods = options.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

  return async (context, next) => {
    const originHeader = context.request.headers.get("origin");
    const resolvedOrigin = resolveCorsOrigin(options.origin, originHeader);

    if (resolvedOrigin === null) {
      return next();
    }

    if (isPreflightRequest(context.request)) {
      const response = new Response(null, { status: 204 });

      applyCorsHeaders(response.headers, {
        origin: resolvedOrigin,
        methods,
        allowedHeaders: options.allowedHeaders ?? readRequestedHeaders(context.request),
        exposedHeaders: options.exposedHeaders,
        credentials: options.credentials,
        maxAge: options.maxAge,
      });

      return response;
    }

    const response = await next();

    applyCorsHeaders(response.headers, {
      origin: resolvedOrigin,
      methods,
      allowedHeaders: options.allowedHeaders,
      exposedHeaders: options.exposedHeaders,
      credentials: options.credentials,
      maxAge: options.maxAge,
    });

    return response;
  };
}

type CorsOriginResolver = (origin: string | null) => boolean | string | null;

function defaultRequestIdGenerator(): string {
  return crypto.randomUUID();
}

function resolveCorsOrigin(
  originOption: CorsOptions["origin"],
  originHeader: string | null,
): string | null {
  if (originHeader === null) {
    return null;
  }

  if (originOption === undefined || originOption === true) {
    return originHeader;
  }

  if (typeof originOption === "string") {
    return originOption === originHeader ? originHeader : null;
  }

  if (Array.isArray(originOption)) {
    return originOption.includes(originHeader) ? originHeader : null;
  }

  const resolved = (originOption as CorsOriginResolver)(originHeader);

  if (resolved === true) {
    return originHeader;
  }

  return typeof resolved === "string" ? resolved : null;
}

function isPreflightRequest(request: Request): boolean {
  return request.method === "OPTIONS" && request.headers.has("access-control-request-method");
}

function readRequestedHeaders(request: Request): string[] | undefined {
  const requestedHeaders = request.headers.get("access-control-request-headers");

  if (!requestedHeaders) {
    return undefined;
  }

  return requestedHeaders
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

function applyCorsHeaders(
  headers: Headers,
  options: {
    origin: string;
    methods: ReadonlyArray<string>;
    allowedHeaders?: ReadonlyArray<string> | undefined;
    exposedHeaders?: ReadonlyArray<string> | undefined;
    credentials?: boolean | undefined;
    maxAge?: number | undefined;
  },
): void {
  headers.set("access-control-allow-origin", options.origin);
  appendVary(headers, "Origin");

  if (options.credentials) {
    headers.set("access-control-allow-credentials", "true");
  }

  if (options.allowedHeaders && options.allowedHeaders.length > 0) {
    headers.set("access-control-allow-headers", options.allowedHeaders.join(", "));
    appendVary(headers, "Access-Control-Request-Headers");
  }

  if (options.exposedHeaders && options.exposedHeaders.length > 0) {
    headers.set("access-control-expose-headers", options.exposedHeaders.join(", "));
  }

  headers.set("access-control-allow-methods", options.methods.join(", "));

  if (options.maxAge !== undefined) {
    headers.set("access-control-max-age", String(options.maxAge));
  }
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get("vary");

  if (current === null || current === "") {
    headers.set("vary", value);
    return;
  }

  const values = current.split(",").map((item) => item.trim());

  if (!values.includes(value)) {
    headers.set("vary", `${current}, ${value}`);
  }
}
