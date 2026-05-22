import type {
  ActionContractResult,
  ActionDefinition,
  ActionResponseDefinitions,
  ConfigDefinition,
  HttpMethod,
  InferResolvedConfig,
  MaybePromise,
} from "@action-js/core";
import { resolveConfig } from "@action-js/core";

import { handleHandlerError } from "./errors.js";
import { jsonResponse } from "./http.js";
import { getActionAppInternals, setActionAppInternals } from "./internals.js";
import type { LifecycleHooks, StartContext, StopContext } from "./lifecycle.js";
import type { MiddlewareHandler } from "./middleware.js";
import type { ActionPlugin, PluginErrorContext, PluginRequestContext, PluginResponseContext } from "./plugin.js";
import { parseQuery, parseRequestBody, readRawRequestBody } from "./request.js";
import { finalizeActionResponse } from "./response-contracts.js";
import { matchPath } from "./routing.js";
import { isWebhookActionDefinition, type AnyActionDefinition, type ContextValues } from "./shared.js";
import { validateInput } from "./validation.js";

interface RegisteredAction<TServices> {
  definition: AnyActionDefinition<TServices, any>;
}

const CONFIG_CONTEXT_KEY = "config";

type ConfigContext<TResolvedConfig> = [TResolvedConfig] extends [undefined]
  ? {}
  : {
      readonly config: TResolvedConfig;
    };

type ResolvedConfigValue<TConfigDefinition extends ConfigDefinition<any> | undefined> = [TConfigDefinition] extends [undefined]
  ? undefined
  : InferResolvedConfig<NonNullable<TConfigDefinition>>;

type ActionAppContext<TContext extends object, TResolvedConfig> = TContext & ConfigContext<TResolvedConfig>;

export interface CreateActionAppOptions<
  TServices,
  TContext extends object = {},
  TConfigDefinition extends ConfigDefinition<any> | undefined = undefined,
> {
  actions?: ReadonlyArray<AnyActionDefinition<TServices, ActionAppContext<TContext, ResolvedConfigValue<TConfigDefinition>>>>;
  services?: TServices;
  config?: TConfigDefinition | undefined;
  env?: Record<string, string | undefined> | undefined;
}

export interface ActionApp<TServices, TContext extends object = {}, TConfig = undefined> {
  readonly actions: ReadonlyArray<AnyActionDefinition<TServices, TContext>>;
  readonly config: TConfig;
  use<TExtension extends object>(
    middleware: MiddlewareHandler<TServices, TContext, TExtension>,
  ): ActionApp<TServices, TContext & TExtension, TConfig>;
  plugin<TExtension extends object>(
    definition: ActionPlugin<TServices, TContext, TExtension>,
  ): ActionApp<TServices, TContext & TExtension, TConfig>;
  onStart(callback: (context: StartContext<TServices>) => MaybePromise<void>): ActionApp<TServices, TContext, TConfig>;
  onStop(callback: (context: StopContext<TServices>) => MaybePromise<void>): ActionApp<TServices, TContext, TConfig>;
  onRequest(callback: (context: PluginRequestContext<TServices, TContext>) => MaybePromise<void>): ActionApp<TServices, TContext, TConfig>;
  onResponse(callback: (context: PluginResponseContext<TServices, TContext>) => MaybePromise<void>): ActionApp<TServices, TContext, TConfig>;
  onError(callback: (context: PluginErrorContext<TServices, TContext>) => MaybePromise<void>): ActionApp<TServices, TContext, TConfig>;
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
  ): ActionApp<TServices, TContext, TConfig>;
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
  ): ActionApp<TServices, TContext, TConfig>;
  fetch(request: Request): Promise<Response>;
}

export function createActionApp<
  TServices = Record<string, never>,
  TContext extends object = {},
  TConfigDefinition extends ConfigDefinition<any> | undefined = undefined,
>(
  options: CreateActionAppOptions<TServices, TContext, TConfigDefinition> = {},
): ActionApp<
  TServices,
  ActionAppContext<TContext, ResolvedConfigValue<TConfigDefinition>>,
  ResolvedConfigValue<TConfigDefinition>
> {
  const services = options.services ?? ({} as TServices);
  const actions: RegisteredAction<TServices>[] = [];
  const middlewares: Array<MiddlewareHandler<TServices, any, any>> = [];
  const hooks: LifecycleHooks<TServices> = {
    onStart: [],
    onStop: [],
    onRequest: [],
    onResponse: [],
    onError: [],
  };
  const resolvedConfig = (options.config ? resolveConfig(options.config, options.env) : undefined) as ResolvedConfigValue<TConfigDefinition>;

  for (const definition of options.actions ?? []) {
    actions.push({
      definition: definition as AnyActionDefinition<TServices, any>,
    });
  }

  const createAppApi = <TCurrentContext extends object>(): ActionApp<TServices, TCurrentContext, ResolvedConfigValue<TConfigDefinition>> => {
    const app: ActionApp<TServices, TCurrentContext, ResolvedConfigValue<TConfigDefinition>> = {
      get actions() {
        return actions.map(({ definition }) => definition) as ReadonlyArray<AnyActionDefinition<TServices, TCurrentContext>>;
      },

      get config() {
        return resolvedConfig;
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

        if (definition.hooks?.onStart) {
          hooks.onStart.push(async (context) => definition.hooks?.onStart?.(context));
        }

        if (definition.hooks?.onStop) {
          hooks.onStop.push(async (context) => definition.hooks?.onStop?.(context));
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

      onStart(callback) {
        hooks.onStart.push(async (context) => callback(context));
        return createAppApi<TCurrentContext>();
      },

      onStop(callback) {
        hooks.onStop.push(async (context) => callback(context));
        return createAppApi<TCurrentContext>();
      },

      onRequest(callback) {
        hooks.onRequest.push(async (context) => callback(context as PluginRequestContext<TServices, TCurrentContext>));
        return createAppApi<TCurrentContext>();
      },

      onResponse(callback) {
        hooks.onResponse.push(async (context) => callback(context as PluginResponseContext<TServices, TCurrentContext>));
        return createAppApi<TCurrentContext>();
      },

      onError(callback) {
        hooks.onError.push(async (context) => callback(context as PluginErrorContext<TServices, TCurrentContext>));
        return createAppApi<TCurrentContext>();
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
        const middlewareContext = createMiddlewareContext(request, services, contextValues, resolvedConfig);

        return runMiddlewares(middlewares, middlewareContext, () =>
          dispatchRequest(request, services, actions, hooks, contextValues, resolvedConfig),
        );
      },
    };

    return setActionAppInternals(app, { services, hooks }) as ActionApp<TServices, TCurrentContext, ResolvedConfigValue<TConfigDefinition>>;
  };

  return createAppApi<ActionAppContext<TContext, ResolvedConfigValue<TConfigDefinition>>>();
}

export async function runStartHooks<TServices>(hooks: LifecycleHooks<TServices>, services: TServices): Promise<void> {
  const context: StartContext<TServices> = { services };

  for (const hook of hooks.onStart) {
    await hook(context);
  }
}

export async function runStopHooks<TServices>(hooks: LifecycleHooks<TServices>, services: TServices): Promise<void> {
  const context: StopContext<TServices> = { services };

  for (const hook of hooks.onStop) {
    await hook(context);
  }
}

async function dispatchRequest<TServices>(
  request: Request,
  services: TServices,
  actions: Array<RegisteredAction<TServices>>,
  hooks: LifecycleHooks<TServices>,
  contextValues: ContextValues,
  resolvedConfig: unknown,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const requestId = getRequestId(contextValues);
  const hookContext = createHookContext(request, services, contextValues, resolvedConfig);

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
    const rawBody = isWebhookActionDefinition(registeredAction.definition)
      ? await readRawRequestBody(request)
      : undefined;

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
      if (isWebhookActionDefinition(registeredAction.definition) && registeredAction.definition.verify) {
        await registeredAction.definition.verify({
          ...contextValues,
          request,
          rawBody: rawBody ?? "",
          headers: request.headers,
          services,
        });
      }

      const result = await registeredAction.definition.handler({
        ...contextValues,
        ...(resolvedConfig !== undefined ? { config: resolvedConfig } : {}),
        ...(rawBody !== undefined ? { rawBody } : {}),
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
  resolvedConfig: unknown,
) {
  const middlewareContext = {
    request,
    services,
    setContext(extension: Record<string, unknown>) {
      if (resolvedConfig !== undefined && CONFIG_CONTEXT_KEY in extension) {
        throw new Error(`Context key '${CONFIG_CONTEXT_KEY}' is reserved by Action.js when app config is enabled`);
      }

      Object.assign(contextValues, extension);
      Object.assign(middlewareContext, extension);
    },
  } as ContextValues & {
    request: Request;
    services: TServices;
    setContext: (extension: Record<string, unknown>) => void;
  };

  if (resolvedConfig !== undefined) {
    Object.defineProperty(middlewareContext, CONFIG_CONTEXT_KEY, {
      value: resolvedConfig,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }

  return middlewareContext;
}

function createHookContext<TServices>(
  request: Request,
  services: TServices,
  contextValues: ContextValues,
  resolvedConfig: unknown,
) {
  return {
    ...contextValues,
    ...(resolvedConfig !== undefined ? { config: resolvedConfig } : {}),
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

export function getAppLifecycleHooks<TServices, TContext extends object, TConfig>(
  app: ActionApp<TServices, TContext, TConfig>,
): LifecycleHooks<TServices> {
  return getActionAppInternals(app).hooks;
}

export function getAppServices<TServices, TContext extends object, TConfig>(app: ActionApp<TServices, TContext, TConfig>): TServices {
  return getActionAppInternals(app).services;
}
