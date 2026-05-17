import { isActionError, isActionErrorDefinition, type ActionError, type ActionErrorDefinition, type ActionResponseDefinitions, type ErrorResponseBody } from "@action-js/core";

import { jsonResponse } from "./http.js";
import { createInvalidActionResponseResponse } from "./response-contracts.js";
import type { ValidationResult } from "./shared.js";

export function handleHandlerError(error: unknown, responseDefinitions: ActionResponseDefinitions | undefined): Response {
  if (isActionError(error)) {
    const contractResult = validateActionErrorContract(error, responseDefinitions);

    if (!contractResult.success) {
      return contractResult.response;
    }

    return jsonResponse(serializeActionError(error), error.status, error.headers);
  }

  return jsonResponse(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      },
    },
    500,
  );
}

function validateActionErrorContract(
  error: ActionError<ActionErrorDefinition>,
  responseDefinitions: ActionResponseDefinitions | undefined,
): ValidationResult<ActionError<ActionErrorDefinition>> {
  if (responseDefinitions === undefined) {
    return {
      success: true,
      data: error,
    };
  }

  const definition = responseDefinitions[error.status];

  if (definition === undefined) {
    return {
      success: false,
      response: createInvalidActionResponseResponse([
        {
          path: "response.status",
          message: `Thrown action error status ${error.status} is not declared in the action response contract`,
        },
      ]),
    };
  }

  if (!isActionErrorDefinition(definition)) {
    return {
      success: false,
      response: createInvalidActionResponseResponse([
        {
          path: "response.status",
          message: `Thrown action error status ${error.status} conflicts with a success response contract`,
        },
      ]),
    };
  }

  if (definition.code !== error.code) {
    return {
      success: false,
      response: createInvalidActionResponseResponse([
        {
          path: "response.error.code",
          message: `Thrown action error code ${error.code} does not match declared error code ${definition.code}`,
        },
      ]),
    };
  }

  return {
    success: true,
    data: error,
  };
}

function serializeActionError(error: ActionError<ActionErrorDefinition>): ErrorResponseBody {
  const payload: ErrorResponseBody = {
    error: {
      code: error.code,
      message: error.message,
    },
  };

  if (error.details !== undefined) {
    payload.error.details = error.details;
  }

  if (error.metadata !== undefined) {
    payload.error.metadata = error.metadata;
  }

  return payload;
}
