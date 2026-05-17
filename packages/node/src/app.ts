import type { ActionContractResult, ActionDefinition, ActionResponseDefinitions, HttpMethod } from "@action-js/core";

import { handleHandlerError } from "./errors.js";
import { jsonResponse } from "./http.js";
import { parseQuery, parseRequestBody } from "./request.js";
import { finalizeActionResponse } from "./response-contracts.js";
import { matchPath } from "./routing.js";
import type { AnyActionDefinition } from "./shared.js";
import { validateInput } from "./validation.js";

interface RegisteredAction<TServices> {
  definition: AnyActionDefinition<TServices>;
}

export interface CreateActionAppOptions<TServices> {
  actions?: ReadonlyArray<AnyActionDefinition<TServices>>;
  services?: TServices;
}

export interface ActionApp<TServices> {
  readonly actions: ReadonlyArray<AnyActionDefinition<TServices>>;
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
      TParamsSchema,
      TQuerySchema,
      TBodySchema,
      TResponses,
      TResult
    >,
  ): ActionApp<TServices>;
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
      TParamsSchema,
      TQuerySchema,
      TBodySchema,
      TResponses,
      TResult
    >,
  ): ActionApp<TServices>;
  fetch(request: Request): Promise<Response>;
}

export function createActionApp<TServices = Record<string, never>>(
  options: CreateActionAppOptions<TServices> = {},
): ActionApp<TServices> {
  const services = options.services ?? ({} as TServices);
  const actions: RegisteredAction<TServices>[] = [];

  for (const definition of options.actions ?? []) {
    actions.push({
      definition: definition as AnyActionDefinition<TServices>,
    });
  }

  const app: ActionApp<TServices> = {
    get actions() {
      return actions.map(({ definition }) => definition);
    },

    action(definition) {
      actions.push({
        definition: definition as AnyActionDefinition<TServices>,
      });

      return app;
    },

    route(definition) {
      return app.action(definition);
    },

    async fetch(request) {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();

      for (const registeredAction of actions) {
        if (registeredAction.definition.method !== method) {
          continue;
        }

        const params = matchPath(registeredAction.definition.path, url.pathname);

        if (!params) {
          continue;
        }

        const query = parseQuery(url.searchParams);

        const paramsResult = validateInput("params", registeredAction.definition.params, params);

        if (!paramsResult.success) {
          return paramsResult.response;
        }

        const queryResult = validateInput("query", registeredAction.definition.query, query);

        if (!queryResult.success) {
          return queryResult.response;
        }

        const bodyResult = await parseRequestBody(request, registeredAction.definition.body !== undefined);

        if (!bodyResult.success) {
          return bodyResult.response;
        }

        const validatedBodyResult = validateInput("body", registeredAction.definition.body, bodyResult.data);

        if (!validatedBodyResult.success) {
          return validatedBodyResult.response;
        }

        try {
          const result = await registeredAction.definition.handler({
            request,
            params: paramsResult.data,
            query: queryResult.data,
            body: validatedBodyResult.data,
            services,
          });

          const responseResult = finalizeActionResponse(result, registeredAction.definition.response);

          if (!responseResult.success) {
            return responseResult.response;
          }

          return responseResult.data;
        } catch (error) {
          return handleHandlerError(error, registeredAction.definition.response);
        }
      }

      return jsonResponse(
        {
          error: {
            code: "ACTION_NOT_FOUND",
            message: `No action matched ${method} ${url.pathname}`,
          },
        },
        404,
      );
    },
  };

  return app;
}
