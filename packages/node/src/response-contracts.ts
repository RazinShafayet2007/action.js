import {
  isActionErrorDefinition,
  type ActionResponse,
  type ActionResponseDefinitions,
  type SchemaIssue,
  type SchemaLike,
} from "@action-js/core";

import { jsonResponse, toHttpResponse } from "./http.js";
import type { ValidationResult } from "./shared.js";

export function finalizeActionResponse(
  result: ActionResponse | Response,
  responseDefinitions: ActionResponseDefinitions | undefined,
  requestId?: string,
): ValidationResult<Response> {
  if (result instanceof Response) {
    return {
      success: true,
      data: result,
    };
  }

  const validatedResult = validateActionResponseContract(result, responseDefinitions, requestId);

  if (!validatedResult.success) {
    return validatedResult;
  }

  return {
    success: true,
    data: toHttpResponse(validatedResult.data),
  };
}

export function createInvalidActionResponseResponse(
  issues: Array<{ path: string; message: string }>,
  requestId?: string,
): Response {
  return jsonResponse(
    {
      error: {
        code: "INVALID_ACTION_RESPONSE",
        message: "Action response does not match its declared contract",
        issues,
        requestId,
      },
    },
    500,
  );
}

function validateActionResponseContract(
  result: ActionResponse,
  responseDefinitions: ActionResponseDefinitions | undefined,
  requestId?: string,
): ValidationResult<ActionResponse> {
  if (responseDefinitions === undefined) {
    return {
      success: true,
      data: result,
    };
  }

  const definition = responseDefinitions[result.status];

  if (definition === undefined) {
    return {
      success: false,
      response: createInvalidActionResponseResponse(
        [
          {
            path: "response.status",
            message: `Status ${result.status} is not declared in the action response contract`,
          },
        ],
        requestId,
      ),
    };
  }

  if (isActionErrorDefinition(definition)) {
    return {
      success: false,
      response: createInvalidActionResponseResponse(
        [
          {
            path: "response.status",
            message: `Status ${result.status} is declared as an error response and must be thrown with actionError()`,
          },
        ],
        requestId,
      ),
    };
  }

  const schema = definition as SchemaLike<unknown>;
  const schemaResult = schema.safeParse(result.body);

  if (!schemaResult.success) {
    return {
      success: false,
      response: createInvalidActionResponseResponse(
        schemaResult.error.issues.map((issue: SchemaIssue) => ({
          path: formatResponseIssuePath(issue.path),
          message: issue.message,
        })),
        requestId,
      ),
    };
  }

  return {
    success: true,
    data: {
      ...result,
      body: schemaResult.data,
    },
  };
}

function formatResponseIssuePath(path: SchemaIssue["path"]): string {
  const issuePath = path.map((segment) => String(segment));

  if (issuePath.length === 0) {
    return "response.body";
  }

  return ["response.body", ...issuePath].join(".");
}
