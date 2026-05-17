import type {
  ActionDefinition,
  ActionHandlerResult,
  HttpMethod,
  PathParams,
} from "@action-js/core";

export const packageName = "@action-js/node";

interface RegisteredAction<TServices> {
  definition: ActionDefinition<HttpMethod, string, TServices, ActionHandlerResult>;
}

export interface CreateActionAppOptions<TServices> {
  actions?: ReadonlyArray<ActionDefinition<HttpMethod, string, TServices, ActionHandlerResult>>;
  services?: TServices;
}

export interface ActionApp<TServices> {
  readonly actions: ReadonlyArray<ActionDefinition<HttpMethod, string, TServices, ActionHandlerResult>>;
  action<TMethod extends HttpMethod, TPath extends string, TResult extends ActionHandlerResult>(
    definition: ActionDefinition<TMethod, TPath, TServices, TResult>,
  ): ActionApp<TServices>;
  route<TMethod extends HttpMethod, TPath extends string, TResult extends ActionHandlerResult>(
    definition: ActionDefinition<TMethod, TPath, TServices, TResult>,
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
      definition: definition as ActionDefinition<HttpMethod, string, TServices, ActionHandlerResult>,
    });
  }

  const app: ActionApp<TServices> = {
    get actions() {
      return actions.map(({ definition }) => definition);
    },

    action(definition) {
      actions.push({
        definition: definition as ActionDefinition<HttpMethod, string, TServices, ActionHandlerResult>,
      });

      return app;
    },

    route(definition) {
      return app.action(definition);
    },

    async fetch(request) {
      const url = new URL(request.url);

      for (const registeredAction of actions) {
        if (registeredAction.definition.method !== request.method.toUpperCase()) {
          continue;
        }

        const params = matchPath(registeredAction.definition.path, url.pathname);

        if (!params) {
          continue;
        }

        try {
          const result = await registeredAction.definition.handler({
            request,
            params: params as PathParams<typeof registeredAction.definition.path>,
            query: url.searchParams,
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
