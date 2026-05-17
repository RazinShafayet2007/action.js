import type {
  ActionDefinition,
  ActionHandlerResult,
  HttpMethod,
  RawQuery,
  SchemaIssue,
  SchemaLike,
} from "@action-js/core";

export const packageName = "@action-js/node";

type AnySchema = SchemaLike<any> | undefined;

type AnyActionDefinition<TServices> = ActionDefinition<
  HttpMethod,
  string,
  TServices,
  AnySchema,
  AnySchema,
  AnySchema,
  ActionHandlerResult
>;

interface RegisteredAction<TServices> {
  definition: AnyActionDefinition<TServices>;
}

export interface CreateActionAppOptions<TServices> {
  actions?: ReadonlyArray<AnyActionDefinition<TServices>>;
  services?: TServices;
}

export interface ActionApp<TServices> {
  readonly actions: ReadonlyArray<AnyActionDefinition<TServices>>;
  action<
    TMethod extends HttpMethod,
    TPath extends string,
    TParamsSchema,
    TQuerySchema,
    TBodySchema,
    TResult extends ActionHandlerResult,
  >(
    definition: ActionDefinition<TMethod, TPath, TServices, TParamsSchema, TQuerySchema, TBodySchema, TResult>,
  ): ActionApp<TServices>;
  route<
    TMethod extends HttpMethod,
    TPath extends string,
    TParamsSchema,
    TQuerySchema,
    TBodySchema,
    TResult extends ActionHandlerResult,
  >(
    definition: ActionDefinition<TMethod, TPath, TServices, TParamsSchema, TQuerySchema, TBodySchema, TResult>,
  ): ActionApp<TServices>;
  fetch(request: Request): Promise<Response>;
}

export function createActionApp<TServices = Record<string, never>>(
  options: CreateActionAppOptions<TServices> = {},
): ActionApp<TServices> {
  const services = options.services ?? ({} as TServices);
  const actions: RegisteredAction<TServices>[] = [];

  for (const definition of options.actions ?? []) {
    actions.push({
      definition: definition as AnyActionDefinition<TServices>,
    });
  }

  const app: ActionApp<TServices> = {
    get actions() {
      return actions.map(({ definition }) => definition);
    },

    action(definition) {
      actions.push({
        definition: definition as AnyActionDefinition<TServices>,
      });

      return app;
    },

    route(definition) {
      return app.action(definition);
    },

    async fetch(request) {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();

      for (const registeredAction of actions) {
        if (registeredAction.definition.method !== method) {
          continue;
        }

        const params = matchPath(registeredAction.definition.path, url.pathname);

        if (!params) {
          continue;
        }

        const query = parseQuery(url.searchParams);

        const paramsResult = validateInput("params", registeredAction.definition.params, params);

        if (!paramsResult.success) {
          return paramsResult.response;
        }

        const queryResult = validateInput("query", registeredAction.definition.query, query);

        if (!queryResult.success) {
          return queryResult.response;
        }

        const bodyResult = await parseRequestBody(request, registeredAction.definition.body !== undefined);

        if (!bodyResult.success) {
          return bodyResult.response;
        }

        const validatedBodyResult = validateInput("body", registeredAction.definition.body, bodyResult.data);

        if (!validatedBodyResult.success) {
          return validatedBodyResult.response;
        }

        try {
          const result = await registeredAction.definition.handler({
            request,
            params: paramsResult.data,
            query: queryResult.data,
            body: validatedBodyResult.data,
            services,
          });

          return toResponse(result);
        } catch (error) {
          return jsonResponse(
            {
              error: {
                code: "INTERNAL_ERROR",
                message: "Something went wrong",
              },
            },
            500,
          );
        }
      }

      return jsonResponse(
        {
          error: {
            code: "ACTION_NOT_FOUND",
            message: `No action matched ${request.method.toUpperCase()} ${url.pathname}`,
          },
        },
        404,
      );
    },
  };

  return app;
}

type ValidationResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      response: Response;
    };

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path || "/";
}

function matchPath(pathPattern: string, pathname: string): Record<string, string> | null {
  const patternSegments = normalizePath(pathPattern).split("/").filter(Boolean);
  const pathnameSegments = normalizePath(pathname).split("/").filter(Boolean);

  if (patternSegments.length !== pathnameSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (const [index, patternSegment] of patternSegments.entries()) {
    const pathnameSegment = pathnameSegments[index];

    if (pathnameSegment === undefined) {
      return null;
    }

    if (patternSegment.startsWith(":")) {
      params[patternSegment.slice(1)] = decodeURIComponent(pathnameSegment);
      continue;
    }

    if (patternSegment !== pathnameSegment) {
      return null;
    }
  }

  return params;
}

function parseQuery(searchParams: URLSearchParams): RawQuery {
  const query: RawQuery = {};

  for (const [key, value] of searchParams) {
    const existingValue = query[key];

    if (existingValue === undefined) {
      query[key] = value;
      continue;
    }

    if (Array.isArray(existingValue)) {
      existingValue.push(value);
      continue;
    }

    query[key] = [existingValue, value];
  }

  return query;
}

function validateInput<TInput, TOutput>(
  source: "params" | "query" | "body",
  schema: SchemaLike<TOutput> | undefined,
  input: TInput,
): ValidationResult<TInput | TOutput> {
  if (!schema) {
    return {
      success: true,
      data: input,
    };
  }

  const result = schema.safeParse(input);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    response: createValidationErrorResponse(
      result.error.issues.map((issue) => ({
        path: formatIssuePath(source, issue.path),
        message: issue.message,
      })),
    ),
  };
}

async function parseRequestBody(request: Request, expectsJsonBody: boolean): Promise<ValidationResult<unknown>> {
  if (request.method === "GET" || request.method === "HEAD" || request.body === null) {
    return {
      success: true,
      data: undefined,
    };
  }

  const rawBody = await request.text();

  if (rawBody === "") {
    return {
      success: true,
      data: undefined,
    };
  }

  const contentType = request.headers.get("content-type");

  if (contentType !== null && !isJsonContentType(contentType)) {
    if (expectsJsonBody) {
      return {
        success: false,
        response: createValidationErrorResponse([
          {
            path: "body",
            message: "Expected application/json request body",
          },
        ]),
      };
    }

    return {
      success: true,
      data: rawBody,
    };
  }

  try {
    return {
      success: true,
      data: JSON.parse(rawBody),
    };
  } catch {
    return {
      success: false,
      response: createValidationErrorResponse([
        {
          path: "body",
          message: "Invalid JSON body",
        },
      ]),
    };
  }
}

function createValidationErrorResponse(issues: Array<{ path: string; message: string }>): Response {
  return jsonResponse(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request input",
        issues,
      },
    },
    400,
  );
}

function formatIssuePath(source: "params" | "query" | "body", path: SchemaIssue["path"]): string {
  const issuePath = path.map((segment) => String(segment));

  if (issuePath.length === 0) {
    return source;
  }

  return [source, ...issuePath].join(".");
}

function isJsonContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes("application/json");
}

function toResponse(result: ActionHandlerResult): Response {
  if (result instanceof Response) {
    return result;
  }

  const headers = new Headers(result.headers);

  if (result.body === undefined) {
    return new Response(null, {
      status: result.status,
      headers,
    });
  }

  if (isResponseBodyInit(result.body)) {
    return new Response(result.body, {
      status: result.status,
      headers,
    });
  }

  return jsonResponse(result.body, result.status, headers);
}

function jsonResponse(body: unknown, status: number, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function isResponseBodyInit(value: unknown): value is Exclude<BodyInit, ReadableStream<unknown>> {
  return (
    typeof value === "string" ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof FormData ||
    value instanceof URLSearchParams
  );
}
