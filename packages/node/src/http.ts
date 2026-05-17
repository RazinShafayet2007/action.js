import type { ActionResponse } from "@action-js/core";

export function toHttpResponse(result: ActionResponse): Response {
  const headers = new Headers(result.headers);

  if (result.body === undefined) {
    return new Response(null, {
      status: result.status,
      headers,
    });
  }

  if (isResponseBodyInit(result.body)) {
    return new Response(result.body, {
      status: result.status,
      headers,
    });
  }

  return jsonResponse(result.body, result.status, headers);
}

export function jsonResponse(body: unknown, status: number, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

function isResponseBodyInit(value: unknown): value is Exclude<BodyInit, ReadableStream<unknown>> {
  return (
    typeof value === "string" ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof FormData ||
    value instanceof URLSearchParams
  );
}
