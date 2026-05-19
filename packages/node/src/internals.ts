import type { ActionApp } from "./app.js";
import type { LifecycleHooks } from "./lifecycle.js";

export const actionAppInternals = Symbol.for("@action-js/node/app-internals");

export interface ActionAppInternals<TServices> {
  services: TServices;
  hooks: LifecycleHooks<TServices>;
}

type ActionAppWithInternals<TServices, TContext extends object> = ActionApp<TServices, TContext> & {
  [actionAppInternals]: ActionAppInternals<TServices>;
};

export function setActionAppInternals<TServices, TContext extends object>(
  app: ActionApp<TServices, TContext>,
  internals: ActionAppInternals<TServices>,
): ActionApp<TServices, TContext> {
  (app as ActionAppWithInternals<TServices, TContext>)[actionAppInternals] = internals;
  return app;
}

export function getActionAppInternals<TServices, TContext extends object>(
  app: ActionApp<TServices, TContext>,
): ActionAppInternals<TServices> {
  return (app as ActionAppWithInternals<TServices, TContext>)[actionAppInternals];
}
