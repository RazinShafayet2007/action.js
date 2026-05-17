import type { RawQuery } from "@action-js/core";

import { createValidationErrorResponse } from "./validation.js";
import type { ValidationResult } from "./shared.js";

export function parseQuery(searchParams: URLSearchParams): RawQuery {
  const query: RawQuery = {};

  for (const [key, value] of searchParams) {
    const existingValue = query[key];

    if (existingValue === undefined) {
      query[key] = value;
      continue;
    }

    if (Array.isArray(existingValue)) {
      existingValue.push(value);
      continue;
    }

    query[key] = [existingValue, value];
  }

  return query;
}

export async function parseRequestBody(request: Request, expectsJsonBody: boolean): Promise<ValidationResult<unknown>> {
  if (request.method === "GET" || request.method === "HEAD" || request.body === null) {
    return {
      success: true,
      data: undefined,
    };
  }

  const rawBody = await request.text();

  if (rawBody === "") {
    return {
      success: true,
      data: undefined,
    };
  }

  const contentType = request.headers.get("content-type");

  if (contentType !== null && !isJsonContentType(contentType)) {
    if (expectsJsonBody) {
      return {
        success: false,
        response: createValidationErrorResponse([
          {
            path: "body",
            message: "Expected application/json request body",
          },
        ]),
      };
    }

    return {
      success: true,
      data: rawBody,
    };
  }

  try {
    return {
      success: true,
      data: JSON.parse(rawBody),
    };
  } catch {
    return {
      success: false,
      response: createValidationErrorResponse([
        {
          path: "body",
          message: "Invalid JSON body",
        },
      ]),
    };
  }
}

function isJsonContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes("application/json");
}
