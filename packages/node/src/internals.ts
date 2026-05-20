import type { ActionApp } from "./app.js";
import type { LifecycleHooks } from "./lifecycle.js";

export const actionAppInternals = Symbol.for("@action-js/node/app-internals");

export interface ActionAppInternals<TServices> {
  services: TServices;
  hooks: LifecycleHooks<TServices>;
}

type ActionAppWithTypedInternals<TServices, TContext extends object, TConfig> = ActionApp<TServices, TContext, TConfig> & {
  [actionAppInternals]: ActionAppInternals<TServices>;
};

export function setActionAppInternals<TServices, TContext extends object, TConfig>(
  app: ActionApp<TServices, TContext, TConfig>,
  internals: ActionAppInternals<TServices>,
): ActionApp<TServices, TContext, TConfig> {
  (app as ActionAppWithTypedInternals<TServices, TContext, TConfig>)[actionAppInternals] = internals;
  return app;
}

export function getActionAppInternals<TServices, TContext extends object, TConfig>(
  app: ActionApp<TServices, TContext, TConfig>,
): ActionAppInternals<TServices> {
  return (app as ActionAppWithTypedInternals<TServices, TContext, TConfig>)[actionAppInternals];
}
