import { plugin, type ActionPlugin, type MiddlewareContext } from "@action-js/node";

import type { DrizzleContext, DrizzlePluginOptions } from "./types.js";

export function drizzlePlugin<TServices, TContext extends object = {}, TDb = unknown>(
  options: DrizzlePluginOptions<TDb>,
): ActionPlugin<TServices, TContext, DrizzleContext<TDb>> {
  return plugin<TServices, TContext, DrizzleContext<TDb>>({
    name: "drizzle",
    middlewares: [
      async (
        context: MiddlewareContext<TServices, TContext, DrizzleContext<TDb>>,
        next: () => Promise<Response>,
      ) => {
        context.setContext({
          db: options.db,
        });

        return next();
      },
    ],
  });
}
