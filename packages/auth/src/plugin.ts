import { plugin, type ActionPlugin, type MiddlewareContext } from "@action-js/node";

import type { ActionUser, AuthPluginOptions, AuthResolveResult, AuthState } from "./types.js";

export function authPlugin<
  TServices,
  TContext extends object = {},
  TUser extends ActionUser = ActionUser,
  TSession = Record<string, never>,
>(
  options: AuthPluginOptions<TServices, TContext, TUser, TSession>,
): ActionPlugin<TServices, TContext, AuthState<TUser, TSession>> {
  return plugin<TServices, TContext, AuthState<TUser, TSession>>({
    name: "auth",
    middlewares: [
      async (
        context: MiddlewareContext<TServices, TContext, AuthState<TUser, TSession>>,
        next: () => Promise<Response>,
      ) => {
        const resolved = await options.resolve(context as Parameters<typeof options.resolve>[0]);
        const state = toAuthState<TUser, TSession>(resolved);

        context.setContext(state);

        return next();
      },
    ],
  });
}

function toAuthState<TUser extends ActionUser, TSession>(
  resolved: AuthResolveResult<TUser, TSession>,
): AuthState<TUser, TSession> {
  if (resolved === null) {
    return {
      user: null,
      session: null,
    };
  }

  return {
    user: resolved.user,
    session: resolved.session ?? null,
  };
}
