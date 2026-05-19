import { actionError } from "@action-js/core";

import { ForbiddenError, UnauthorizedError } from "./errors.js";
import type { AnyActionHandler, AuthenticatedContext, PolicyDefinition } from "./types.js";

type UserCarrier<TUser> = {
  user: TUser | null;
};

export function requireUser<TContext extends UserCarrier<TUser>, TUser, TResult>(
  handler: AnyActionHandler<AuthenticatedContext<TContext, TUser>, TResult>,
): AnyActionHandler<TContext, TResult> {
  return (async (context: TContext) => {
    if (context.user === null) {
      throw actionError(UnauthorizedError);
    }

    return handler(context as AuthenticatedContext<TContext, TUser>);
  }) as AnyActionHandler<TContext, TResult>;
}

export function authorize<TContext extends UserCarrier<TUser>, TUser, TResult>(
  definition: PolicyDefinition<
    string,
    AuthenticatedContext<TContext, TUser>
  >,
  handler: AnyActionHandler<AuthenticatedContext<TContext, TUser>, TResult>,
): AnyActionHandler<TContext, TResult> {
  return requireUser<TContext, TUser, TResult>(async (context) => {
    const allowed = await definition.check(context);

    if (!allowed) {
      throw actionError(ForbiddenError);
    }

    return handler(context);
  });
}
