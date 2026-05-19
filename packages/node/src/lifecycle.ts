import type { MaybePromise } from "@action-js/core";

import type { PluginErrorContext, PluginRequestContext, PluginResponseContext } from "./plugin.js";

export interface StartContext<TServices> {
  services: TServices;
}

export interface StopContext<TServices> {
  services: TServices;
}

export interface LifecycleHooks<TServices> {
  onStart: Array<(context: StartContext<TServices>) => Promise<void>>;
  onStop: Array<(context: StopContext<TServices>) => Promise<void>>;
  onRequest: Array<(context: PluginRequestContext<TServices, any>) => Promise<void>>;
  onResponse: Array<(context: PluginResponseContext<TServices, any>) => Promise<void>>;
  onError: Array<(context: PluginErrorContext<TServices, any>) => Promise<void>>;
}

export interface LifecycleHandlerSet<TServices, TContext extends object> {
  onStart?: ((context: StartContext<TServices>) => MaybePromise<void>) | undefined;
  onStop?: ((context: StopContext<TServices>) => MaybePromise<void>) | undefined;
  onRequest?: ((context: PluginRequestContext<TServices, TContext>) => MaybePromise<void>) | undefined;
  onResponse?: ((context: PluginResponseContext<TServices, TContext>) => MaybePromise<void>) | undefined;
  onError?: ((context: PluginErrorContext<TServices, TContext>) => MaybePromise<void>) | undefined;
}
