import type { ActionApp } from "@action-js/node";

import { toTestResponse } from "./response.js";
import type { TestApp, TestAppOptions, TestRequestBuilder, TestResponse } from "./types.js";

export function createTestApp<TServices = Record<string, never>, TContext extends object = {}>(
  app: ActionApp<TServices, TContext>,
  options: TestAppOptions = {},
): TestApp<TServices, TContext> {
  const baseUrl = options.baseUrl ?? "http://localhost";

  return {
    app,
    request(path, method = "GET") {
      return createRequestBuilder(app, baseUrl, method, path);
    },
    get(path) {
      return createRequestBuilder(app, baseUrl, "GET", path);
    },
    post(path) {
      return createRequestBuilder(app, baseUrl, "POST", path);
    },
    put(path) {
      return createRequestBuilder(app, baseUrl, "PUT", path);
    },
    patch(path) {
      return createRequestBuilder(app, baseUrl, "PATCH", path);
    },
    delete(path) {
      return createRequestBuilder(app, baseUrl, "DELETE", path);
    },
  };
}

function createRequestBuilder<TServices, TContext extends object>(
  app: ActionApp<TServices, TContext>,
  baseUrl: string,
  method: string,
  path: string,
): TestRequestBuilder {
  const headers = new Headers();
  const query = new URLSearchParams();
  let requestBody: BodyInit | undefined;

  const execute = async (): Promise<TestResponse> => {
    const url = new URL(path, ensureTrailingSlash(baseUrl));
    const queryString = query.toString();

    if (queryString !== "") {
      url.search = queryString;
    }

    const response = await app.fetch(
      new Request(url, {
        method,
        headers,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
      }),
    );

    return toTestResponse(response);
  };

  const builder: TestRequestBuilder = {
    headers(nextHeaders) {
      mergeHeaders(headers, nextHeaders);
      return builder;
    },
    query(nextQuery) {
      appendQuery(query, nextQuery);
      return builder;
    },
    body(nextBody) {
      headers.set("content-type", "application/json");
      requestBody = JSON.stringify(nextBody);
      return builder;
    },
    text(nextBody, contentType = "text/plain; charset=utf-8") {
      headers.set("content-type", contentType);
      requestBody = nextBody;
      return builder;
    },
    send() {
      return execute();
    },
    // eslint-disable-next-line unicorn/no-thenable
    then(onfulfilled, onrejected) {
      return execute().then(onfulfilled, onrejected);
    },
  };

  return builder;
}

function appendQuery(searchParams: URLSearchParams, input: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(input)) {
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

function mergeHeaders(target: Headers, source: HeadersInit): void {
  for (const [key, value] of new Headers(source).entries()) {
    target.set(key, value);
  }
}

function ensureTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
