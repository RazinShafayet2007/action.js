import type { MiddlewareHandler } from "./middleware.js";
import type { LifecycleHandlerSet } from "./lifecycle.js";
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

export interface ActionPlugin<TServices, TContext extends object, TExtension extends object = {}> {
  name: string;
  actions?: ReadonlyArray<AnyActionDefinition<TServices, TContext & TExtension>> | undefined;
  middlewares?: ReadonlyArray<MiddlewareHandler<TServices, TContext, TExtension>> | undefined;
  hooks?: LifecycleHandlerSet<TServices, TContext & TExtension> | undefined;
}

export function plugin<TServices, TContext extends object, TExtension extends object = {}>(
  definition: ActionPlugin<TServices, TContext, TExtension>,
): ActionPlugin<TServices, TContext, TExtension> {
  return definition;
}
