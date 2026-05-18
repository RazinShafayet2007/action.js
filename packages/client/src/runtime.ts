import { isActionErrorDefinition, isSchemaLike, type ActionDefinition, type ActionErrorDefinition, type ActionResponseDefinitions, type SchemaLike } from "@action-js/core";

import { ActionClientError } from "./error.js";
import type { AnyAction, ClientActionTree, ClientFromTree, ClientRequestInput, CreateClientOptions } from "./types.js";

export function createClient<TTree extends ClientActionTree>(options: CreateClientOptions<TTree>): ClientFromTree<TTree> {
  return buildClientTree(options.actions, options) as ClientFromTree<TTree>;
}

function buildClientTree(
  tree: ClientActionTree,
  options: CreateClientOptions<ClientActionTree>,
): Record<string, unknown> {
  const clientTree: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(tree)) {
    clientTree[key] = isActionDefinition(value)
      ? createActionCaller(value, options)
      : buildClientTree(value, options);
  }

  return clientTree;
}

function createActionCaller<TAction extends AnyAction>(action: TAction, options: CreateClientOptions<ClientActionTree>) {
  return async (input?: ClientRequestInput<TAction>) => {
    const requestInput = (input ?? {}) as ClientRequestInput<TAction>;
    const url = buildUrl(options.baseUrl, action.path, requestInput);
    const headers = new Headers(options.headers);

    mergeHeaders(headers, requestInput.headers);

    const init: RequestInit = {
      method: action.method,
      headers,
    };

    if (requestInput.signal !== undefined) {
      init.signal = requestInput.signal;
    }

    if ("body" in requestInput && requestInput.body !== undefined) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(requestInput.body);
    }

    const response = await (options.fetch ?? fetch)(url, init);
    const payload = await parseResponsePayload(response);

    if (response.ok) {
      return parseSuccessPayload(action.response, response.status, payload) as Awaited<ReturnType<typeof createActionCaller<TAction>>>;
    }

    throw createClientError(action.response, response, payload);
  };
}

function buildUrl(baseUrl: string, path: string, input: Record<string, unknown>): string {
  const resolvedPath = interpolatePath(path, (input.params ?? {}) as Record<string, unknown>);
  const url = new URL(resolvedPath, ensureTrailingSlash(baseUrl));

  if ("query" in input && input.query !== undefined) {
    appendQuery(url.searchParams, input.query as Record<string, unknown>);
  }

  return url.toString();
}

function interpolatePath(path: string, params: Record<string, unknown>): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => encodeURIComponent(String(params[name])));
}

function appendQuery(searchParams: URLSearchParams, query: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, String(item));
      }

      continue;
    }

    searchParams.set(key, String(value));
  }
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  const text = await response.text();

  if (text === "") {
    return undefined;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase();

  if (contentType?.includes("application/json")) {
    return JSON.parse(text);
  }

  return text;
}

function parseSuccessPayload(
  responses: ActionResponseDefinitions | undefined,
  status: number,
  payload: unknown,
): unknown {
  const schema = resolveSuccessSchema(responses, status);

  if (!schema) {
    return payload;
  }

  const result = schema.safeParse(payload);

  return result.success ? result.data : payload;
}

function resolveSuccessSchema(
  responses: ActionResponseDefinitions | undefined,
  status: number,
): SchemaLike<unknown> | undefined {
  const definition = responses?.[status];

  if (definition === undefined || isActionErrorDefinition(definition) || !isSchemaLike(definition)) {
    return undefined;
  }

  return definition;
}

function createClientError(
  responses: ActionResponseDefinitions | undefined,
  response: Response,
  payload: unknown,
): ActionClientError {
  const definition = resolveErrorDefinition(responses, response.status);

  if (!definition || !isErrorPayload(payload)) {
    return new ActionClientError({
      code: isErrorPayload(payload) ? payload.error.code : "HTTP_ERROR",
      status: response.status,
      message: isErrorPayload(payload) ? payload.error.message : response.statusText || `HTTP ${response.status}`,
      details: isErrorPayload(payload) ? payload.error.details : undefined,
      metadata: isErrorPayload(payload) ? payload.error.metadata : undefined,
      requestId: isErrorPayload(payload) ? payload.error.requestId : undefined,
      response,
    });
  }

  return new ActionClientError({
    code: definition.code,
    status: response.status,
    message: payload.error.message,
    details: parseErrorValue(definition.details, payload.error.details),
    metadata: parseErrorValue(definition.metadata, payload.error.metadata),
    requestId: payload.error.requestId,
    response,
  });
}

function resolveErrorDefinition(
  responses: ActionResponseDefinitions | undefined,
  status: number,
): ActionErrorDefinition | undefined {
  const definition = responses?.[status];

  return definition !== undefined && isActionErrorDefinition(definition) ? definition : undefined;
}

function parseErrorValue(schema: unknown, value: unknown): unknown {
  if (!isSchemaLike(schema)) {
    return value;
  }

  const result = schema.safeParse(value);

  return result.success ? result.data : value;
}

function mergeHeaders(target: Headers, source: HeadersInit | undefined): void {
  if (!source) {
    return;
  }

  for (const [key, value] of new Headers(source).entries()) {
    target.set(key, value);
  }
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function isActionDefinition(value: unknown): value is AnyAction {
  return typeof value === "object" && value !== null && "kind" in value && (value as { kind?: unknown }).kind === "action";
}

function isErrorPayload(
  value: unknown,
): value is {
  error: {
    code: string;
    message: string;
    details?: unknown;
    metadata?: unknown;
    requestId?: string;
  };
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "object" &&
    (value as { error?: { code?: unknown; message?: unknown } }).error?.code !== undefined &&
    (value as { error?: { code?: unknown; message?: unknown } }).error?.message !== undefined
  );
}
