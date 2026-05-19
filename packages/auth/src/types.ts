import type { ActionDefinition, ActionResponseDefinitions, HttpMethod, MaybePromise } from "@action-js/core";

export interface ActionUser {
  id: string;
  email?: string | undefined;
  roles?: string[] | undefined;
}

export interface AuthState<TUser, TSession> {
  user: TUser | null;
  session: TSession | null;
}

export interface AuthResolvePayload<TUser, TSession> {
  user: TUser;
  session?: TSession | null | undefined;
}

export type AuthResolveResult<TUser, TSession> = AuthResolvePayload<TUser, TSession> | null;

export type AuthResolveContext<TServices, TContext extends object> = TContext & {
  request: Request;
  services: TServices;
};

export interface AuthPluginOptions<
  TServices,
  TContext extends object,
  TUser extends ActionUser,
  TSession,
> {
  resolve: (context: AuthResolveContext<TServices, TContext>) => MaybePromise<AuthResolveResult<TUser, TSession>>;
}

export type AuthenticatedContext<TContext extends { user: unknown | null }, TUser> = Omit<TContext, "user"> & {
  user: TUser;
};

export interface PolicyDefinition<TName extends string, TContext extends object> {
  readonly kind: "policy";
  readonly name: TName;
  readonly check: (context: TContext) => MaybePromise<boolean>;
}

export type AnyActionDefinition = ActionDefinition<
  HttpMethod,
  string,
  any,
  any,
  any,
  any,
  any,
  ActionResponseDefinitions | undefined,
  any
>;

export type AnyActionHandler<TContext extends object, TResult = unknown> = (context: TContext) => MaybePromise<TResult>;

export type InferActionResult<TAction> = TAction extends (...args: any[]) => MaybePromise<infer TResult> ? TResult : never;
