import type { ActionContractResult, ActionDefinition, ActionResponseDefinitions, HttpMethod } from "@action-js/core";

import { handleHandlerError } from "./errors.js";
import { jsonResponse } from "./http.js";
import type { MiddlewareHandler } from "./middleware.js";
import type { ActionPlugin, PluginErrorContext, PluginRequestContext, PluginResponseContext } from "./plugin.js";
import { parseQuery, parseRequestBody } from "./request.js";
import { finalizeActionResponse } from "./response-contracts.js";
import { matchPath } from "./routing.js";
import type { AnyActionDefinition, ContextValues } from "./shared.js";
import { validateInput } from "./validation.js";

interface RegisteredAction<TServices> {
  definition: AnyActionDefinition<TServices, any>;
}

interface LifecycleHooks<TServices> {
  onRequest: Array<(context: PluginRequestContext<TServices, any>) => Promise<void>>;
  onResponse: Array<(context: PluginResponseContext<TServices, any>) => Promise<void>>;
  onError: Array<(context: PluginErrorContext<TServices, any>) => Promise<void>>;
}

export interface CreateActionAppOptions<TServices, TContext extends object = {}> {
  actions?: ReadonlyArray<AnyActionDefinition<TServices, TContext>>;
  services?: TServices;
}

export interface ActionApp<TServices, TContext extends object = {}> {
  readonly actions: ReadonlyArray<AnyActionDefinition<TServices, TContext>>;
  use<TExtension extends object>(
    middleware: MiddlewareHandler<TServices, TContext, TExtension>,
  ): ActionApp<TServices, TContext & TExtension>;
  plugin<TExtension extends object>(
    definition: ActionPlugin<TServices, TContext, TExtension>,
  ): ActionApp<TServices, TContext & TExtension>;
  action<
    TMethod extends HttpMethod,
    TPath extends string,
    TParamsSchema,
    TQuerySchema,
    TBodySchema,
    TResponses extends ActionResponseDefinitions | undefined,
    TResult extends ActionContractResult<TResponses>,
  >(
    definition: ActionDefinition<
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
  ): ActionApp<TServices, TContext>;
  route<
    TMethod extends HttpMethod,
    TPath extends string,
    TParamsSchema,
    TQuerySchema,
    TBodySchema,
    TResponses extends ActionResponseDefinitions | undefined,
    TResult extends ActionContractResult<TResponses>,
  >(
    definition: ActionDefinition<
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
  ): ActionApp<TServices, TContext>;
  fetch(request: Request): Promise<Response>;
}

export function createActionApp<TServices = Record<string, never>, TContext extends object = {}>(
  options: CreateActionAppOptions<TServices, TContext> = {},
): ActionApp<TServices, TContext> {
  const services = options.services ?? ({} as TServices);
  const actions: RegisteredAction<TServices>[] = [];
  const middlewares: Array<MiddlewareHandler<TServices, any, any>> = [];
  const hooks: LifecycleHooks<TServices> = {
    onRequest: [],
    onResponse: [],
    onError: [],
  };

  for (const definition of options.actions ?? []) {
    actions.push({
      definition: definition as AnyActionDefinition<TServices, any>,
    });
  }

  const createAppApi = <TCurrentContext extends object>(): ActionApp<TServices, TCurrentContext> => ({
    get actions() {
      return actions.map(({ definition }) => definition) as ReadonlyArray<AnyActionDefinition<TServices, TCurrentContext>>;
    },

    use<TExtension extends object>(middleware: MiddlewareHandler<TServices, TCurrentContext, TExtension>) {
      middlewares.push(middleware as MiddlewareHandler<TServices, any, any>);
      return createAppApi<TCurrentContext & TExtension>();
    },

    plugin<TExtension extends object>(definition: ActionPlugin<TServices, TCurrentContext, TExtension>) {
      for (const actionDefinition of definition.actions ?? []) {
        actions.push({
          definition: actionDefinition as AnyActionDefinition<TServices, any>,
        });
      }

      for (const middleware of definition.middlewares ?? []) {
        middlewares.push(middleware as MiddlewareHandler<TServices, any, any>);
      }

      if (definition.hooks?.onRequest) {
        hooks.onRequest.push(async (context) => definition.hooks?.onRequest?.(context));
      }

      if (definition.hooks?.onResponse) {
        hooks.onResponse.push(async (context) => definition.hooks?.onResponse?.(context));
      }

      if (definition.hooks?.onError) {
        hooks.onError.push(async (context) => definition.hooks?.onError?.(context));
      }

      return createAppApi<TCurrentContext & TExtension>();
    },

    action(definition) {
      actions.push({
        definition: definition as AnyActionDefinition<TServices, any>,
      });

      return createAppApi<TCurrentContext>();
    },

    route(definition) {
      return createAppApi<TCurrentContext>().action(definition);
    },

    async fetch(request) {
      const contextValues: ContextValues = {};
      const middlewareContext = createMiddlewareContext(request, services, contextValues);

      return runMiddlewares(middlewares, middlewareContext, () =>
        dispatchRequest(request, services, actions, hooks, contextValues),
      );
    },
  });

  return createAppApi<TContext>();
}

async function dispatchRequest<TServices>(
  request: Request,
  services: TServices,
  actions: Array<RegisteredAction<TServices>>,
  hooks: LifecycleHooks<TServices>,
  contextValues: ContextValues,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const requestId = getRequestId(contextValues);
  const hookContext = createHookContext(request, services, contextValues);

  try {
    await runRequestHooks(hooks.onRequest, hookContext);
  } catch (error) {
    return createErrorResponse(error, undefined, hookContext, hooks, requestId);
  }

  for (const registeredAction of actions) {
    if (registeredAction.definition.method !== method) {
      continue;
    }

    const params = matchPath(registeredAction.definition.path, url.pathname);

    if (!params) {
      continue;
    }

    const query = parseQuery(url.searchParams);

    const paramsResult = validateInput("params", registeredAction.definition.params, params, requestId);

    if (!paramsResult.success) {
      return finalizeResponse(paramsResult.response, hookContext, hooks);
    }

    const queryResult = validateInput("query", registeredAction.definition.query, query, requestId);

    if (!queryResult.success) {
      return finalizeResponse(queryResult.response, hookContext, hooks);
    }

    const bodyResult = await parseRequestBody(request, registeredAction.definition.body !== undefined, requestId);

    if (!bodyResult.success) {
      return finalizeResponse(bodyResult.response, hookContext, hooks);
    }

    const validatedBodyResult = validateInput("body", registeredAction.definition.body, bodyResult.data, requestId);

    if (!validatedBodyResult.success) {
      return finalizeResponse(validatedBodyResult.response, hookContext, hooks);
    }

    try {
      const result = await registeredAction.definition.handler({
        ...contextValues,
        request,
        params: paramsResult.data,
        query: queryResult.data,
        body: validatedBodyResult.data,
        services,
      });

      const responseResult = finalizeActionResponse(result, registeredAction.definition.response, requestId);

      const response = responseResult.success ? responseResult.data : responseResult.response;

      return finalizeResponse(response, hookContext, hooks);
    } catch (error) {
      return createErrorResponse(error, registeredAction.definition.response, hookContext, hooks, requestId);
    }
  }

  return finalizeResponse(
    jsonResponse(
      {
        error: {
          code: "ACTION_NOT_FOUND",
          message: `No action matched ${method} ${url.pathname}`,
          requestId,
        },
      },
      404,
    ),
    hookContext,
    hooks,
  );
}

function createMiddlewareContext<TServices>(
  request: Request,
  services: TServices,
  contextValues: ContextValues,
) {
  const middlewareContext = {
    request,
    services,
    setContext(extension: Record<string, unknown>) {
      Object.assign(contextValues, extension);
      Object.assign(middlewareContext, extension);
    },
  } as ContextValues & {
    request: Request;
    services: TServices;
    setContext: (extension: Record<string, unknown>) => void;
  };

  return middlewareContext;
}

function createHookContext<TServices>(request: Request, services: TServices, contextValues: ContextValues) {
  return {
    ...contextValues,
    request,
    services,
  } as PluginRequestContext<TServices, any>;
}

async function runMiddlewares(
  middlewares: Array<MiddlewareHandler<any, any, any>>,
  context: Parameters<MiddlewareHandler<any, any, any>>[0],
  dispatch: () => Promise<Response>,
): Promise<Response> {
  let currentIndex = -1;

  const runner = async (index: number): Promise<Response> => {
    if (index <= currentIndex) {
      throw new Error("Middleware next() called multiple times");
    }

    currentIndex = index;
    const middleware = middlewares[index];

    if (!middleware) {
      return dispatch();
    }

    return middleware(context, () => runner(index + 1));
  };

  return runner(0);
}

async function runRequestHooks<TServices>(
  hooks: Array<(context: PluginRequestContext<TServices, any>) => Promise<void>>,
  context: PluginRequestContext<TServices, any>,
): Promise<void> {
  for (const hook of hooks) {
    await hook(context);
  }
}

async function runResponseHooks<TServices>(
  hooks: Array<(context: PluginResponseContext<TServices, any>) => Promise<void>>,
  context: PluginRequestContext<TServices, any>,
  response: Response,
): Promise<Response> {
  for (const hook of hooks) {
    await hook({
      ...context,
      response,
    });
  }

  return response;
}

async function runErrorHooks<TServices>(
  hooks: Array<(context: PluginErrorContext<TServices, any>) => Promise<void>>,
  context: PluginRequestContext<TServices, any>,
  error: unknown,
): Promise<void> {
  for (const hook of hooks) {
    await hook({
      ...context,
      error,
    });
  }
}

async function finalizeResponse<TServices>(
  response: Response,
  context: PluginRequestContext<TServices, any>,
  hooks: LifecycleHooks<TServices>,
): Promise<Response> {
  try {
    return await runResponseHooks(hooks.onResponse, context, response);
  } catch (error) {
    return createErrorResponse(error, undefined, context, hooks, getRequestId(context as ContextValues));
  }
}

async function createErrorResponse<TServices>(
  error: unknown,
  responseDefinitions: ActionResponseDefinitions | undefined,
  context: PluginRequestContext<TServices, any>,
  hooks: LifecycleHooks<TServices>,
  requestId?: string,
): Promise<Response> {
  try {
    await runErrorHooks(hooks.onError, context, error);
  } catch (hookError) {
    error = hookError;
    responseDefinitions = undefined;
  }

  return finalizeResponse(handleHandlerError(error, responseDefinitions, requestId), context, {
    ...hooks,
    onError: [],
  });
}

function getRequestId(contextValues: ContextValues): string | undefined {
  const value = contextValues.requestId;

  return typeof value === "string" ? value : undefined;
}
