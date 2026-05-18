import type { MaybePromise } from "@action-js/core";

import type { MiddlewareHandler } from "./middleware.js";
import type { AnyActionDefinition } from "./shared.js";

export type PluginRequestContext<TServices, TContext extends object> = TContext & {
  request: Request;
  services: TServices;
};

export type PluginResponseContext<TServices, TContext extends object> = PluginRequestContext<TServices, TContext> & {
  response: Response;
};

export type PluginErrorContext<TServices, TContext extends object> = PluginRequestContext<TServices, TContext> & {
  error: unknown;
};

export interface PluginHooks<TServices, TContext extends object> {
  onRequest?: ((context: PluginRequestContext<TServices, TContext>) => MaybePromise<void>) | undefined;
  onResponse?: ((context: PluginResponseContext<TServices, TContext>) => MaybePromise<void>) | undefined;
  onError?: ((context: PluginErrorContext<TServices, TContext>) => MaybePromise<void>) | undefined;
}

export interface ActionPlugin<TServices, TContext extends object, TExtension extends object = {}> {
  name: string;
  actions?: ReadonlyArray<AnyActionDefinition<TServices, TContext & TExtension>> | undefined;
  middlewares?: ReadonlyArray<MiddlewareHandler<TServices, TContext, TExtension>> | undefined;
  hooks?: PluginHooks<TServices, TContext & TExtension> | undefined;
}

export function plugin<TServices, TContext extends object, TExtension extends object = {}>(
  definition: ActionPlugin<TServices, TContext, TExtension>,
): ActionPlugin<TServices, TContext, TExtension> {
  return definition;
}
