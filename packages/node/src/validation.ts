import type { SchemaIssue, SchemaLike } from "@action-js/core";

import { jsonResponse } from "./http.js";
import type { ValidationResult } from "./shared.js";

type InputSource = "params" | "query" | "body";

export function validateInput<TInput, TOutput>(
  source: InputSource,
  schema: SchemaLike<TOutput> | undefined,
  input: TInput,
  requestId?: string,
): ValidationResult<TInput | TOutput> {
  if (!schema) {
    return {
      success: true,
      data: input,
    };
  }

  const result = schema.safeParse(input);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    response: createValidationErrorResponse(
      result.error.issues.map((issue) => ({
        path: formatIssuePath(source, issue.path),
        message: issue.message,
      })),
      requestId,
    ),
  };
}

export function createValidationErrorResponse(
  issues: Array<{ path: string; message: string }>,
  requestId?: string,
): Response {
  return jsonResponse(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request input",
        issues,
        requestId,
      },
    },
    400,
  );
}

function formatIssuePath(source: InputSource, path: SchemaIssue["path"]): string {
  const issuePath = path.map((segment) => String(segment));

  if (issuePath.length === 0) {
    return source;
  }

  return [source, ...issuePath].join(".");
}
