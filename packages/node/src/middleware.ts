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

export interface SecurityHeadersOptions {
  contentTypeOptions?: string | false | undefined;
  frameOptions?: string | false | undefined;
  referrerPolicy?: string | false | undefined;
  permissionsPolicy?: string | false | undefined;
  crossOriginOpenerPolicy?: string | false | undefined;
  crossOriginResourcePolicy?: string | false | undefined;
}

export interface RateLimitOptions<TServices, TContext extends object> {
  limit: number;
  window: number | `${number}${"ms" | "s" | "m" | "h"}`;
  key?: ((context: MiddlewareContext<TServices, TContext>) => MaybePromise<string>) | undefined;
  now?: (() => number) | undefined;
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

export function securityHeaders<TServices, TContext extends object = {}>(
  options: SecurityHeadersOptions = {},
): MiddlewareHandler<TServices, TContext> {
  const resolvedHeaders = {
    "x-content-type-options": options.contentTypeOptions ?? "nosniff",
    "x-frame-options": options.frameOptions ?? "DENY",
    "referrer-policy": options.referrerPolicy ?? "no-referrer",
    "permissions-policy": options.permissionsPolicy ?? "camera=(), geolocation=(), microphone=()",
    "cross-origin-opener-policy": options.crossOriginOpenerPolicy ?? "same-origin",
    "cross-origin-resource-policy": options.crossOriginResourcePolicy ?? "same-origin",
  } as const;

  return async (_context, next) => {
    const response = await next();

    for (const [key, value] of Object.entries(resolvedHeaders)) {
      if (value !== false && !response.headers.has(key)) {
        response.headers.set(key, value);
      }
    }

    return response;
  };
}

export function rateLimit<TServices, TContext extends object = {}>(
  options: RateLimitOptions<TServices, TContext>,
): MiddlewareHandler<TServices, TContext> {
  const windowMs = parseDuration(options.window);
  const entries = new Map<string, { count: number; resetAt: number }>();

  return async (context, next) => {
    const now = options.now?.() ?? Date.now();
    const key = options.key ? await options.key(context) : defaultRateLimitKey(context.request);
    const currentEntry = entries.get(key);
    const entry = !currentEntry || now >= currentEntry.resetAt
      ? { count: 0, resetAt: now + windowMs }
      : currentEntry;

    entry.count += 1;
    entries.set(key, entry);

    const remaining = Math.max(options.limit - entry.count, 0);
    const resetSeconds = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
    const resetAtSeconds = Math.ceil(entry.resetAt / 1000);

    if (entry.count > options.limit) {
      const headers = new Headers({
        "content-type": "application/json; charset=utf-8",
      });

      applyRateLimitHeaders(headers, {
        limit: options.limit,
        remaining: 0,
        resetAtSeconds,
        retryAfterSeconds: resetSeconds,
      });

      return new Response(
        JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
          },
        }),
        {
          status: 429,
          headers,
        },
      );
    }

    const response = await next();

    applyRateLimitHeaders(response.headers, {
      limit: options.limit,
      remaining,
      resetAtSeconds,
      retryAfterSeconds: resetSeconds,
    });

    return response;
  };
}

type CorsOriginResolver = (origin: string | null) => boolean | string | null;

function defaultRequestIdGenerator(): string {
  return crypto.randomUUID();
}

function defaultRateLimitKey(request: Request): string {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip") ?? "global";
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

function parseDuration(value: number | `${number}${"ms" | "s" | "m" | "h"}`): number {
  if (typeof value === "number") {
    return value;
  }

  const match = /^(\d+)(ms|s|m|h)$/.exec(value);

  if (!match) {
    throw new Error(`Invalid rate limit window: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case "ms":
      return amount;
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60_000;
    case "h":
      return amount * 3_600_000;
    default:
      throw new Error(`Unsupported rate limit unit: ${unit}`);
  }
}

function applyRateLimitHeaders(
  headers: Headers,
  options: {
    limit: number;
    remaining: number;
    resetAtSeconds: number;
    retryAfterSeconds: number;
  },
): void {
  headers.set("x-ratelimit-limit", String(options.limit));
  headers.set("x-ratelimit-remaining", String(options.remaining));
  headers.set("x-ratelimit-reset", String(options.resetAtSeconds));
  headers.set("retry-after", String(options.retryAfterSeconds));
}
