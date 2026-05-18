import type { ActionDefinition, ActionErrorDefinition, ActionResponseDefinitionValue, ActionResponseDefinitions, HttpMethod } from "@action-js/core";
import { isActionErrorDefinition } from "@action-js/core";

import { getObjectSchemaProperties, isOptionalSchema, toErrorResponseSchema, toOpenApiSchema } from "./schemas.js";
import type { OpenApiDocument, OpenApiInfo, OpenApiOperation, OpenApiParameter, OpenApiResponse, OpenApiSchema, OpenApiServer } from "./types.js";

type AnyAction = ActionDefinition<HttpMethod, string, any, any, any, any, any, any, any>;

export interface CreateOpenApiDocumentOptions {
  info: OpenApiInfo;
  actions: ReadonlyArray<AnyAction>;
  servers?: OpenApiServer[] | undefined;
}

export function createOpenApiDocument(options: CreateOpenApiDocumentOptions): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};

  for (const action of options.actions) {
    const openApiPath = toOpenApiPath(action.path);
    const method = action.method.toLowerCase() as Lowercase<HttpMethod>;

    paths[openApiPath] ??= {};
    paths[openApiPath][method] = createOperation(action);
  }

  return {
    openapi: "3.1.0",
    info: options.info,
    servers: options.servers,
    paths,
  };
}

function createOperation(action: AnyAction): OpenApiOperation {
  const parameters = [
    ...createPathParameters(action.path, action.params),
    ...createQueryParameters(action.query),
  ];

  return {
    operationId: createOperationId(action.method, action.path),
    parameters: parameters.length > 0 ? parameters : undefined,
    requestBody: createRequestBody(action.body),
    responses: createResponses(action.response),
  };
}

function createPathParameters(path: string, schema: unknown): OpenApiParameter[] {
  const pathParamNames = path
    .split("/")
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1));

  if (pathParamNames.length === 0) {
    return [];
  }

  const { properties } =
    schema === undefined ? { properties: {} as Record<string, OpenApiSchema> } : getObjectSchemaProperties(schema);

  return pathParamNames.map((name) => ({
    name,
    in: "path",
    required: true,
    schema: properties[name] ?? { type: "string" },
  }));
}

function createQueryParameters(schema: unknown): OpenApiParameter[] {
  if (schema === undefined) {
    return [];
  }

  const { properties, required } = getObjectSchemaProperties(schema);

  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: "query",
    required: required.includes(name),
    schema: propertySchema,
  }));
}

function createRequestBody(schema: unknown): OpenApiOperation["requestBody"] {
  if (schema === undefined) {
    return undefined;
  }

  return {
    required: !isOptionalSchema(schema),
    content: {
      "application/json": {
        schema: toOpenApiSchema(schema),
      },
    },
  };
}

function createResponses(definitions: ActionResponseDefinitions | undefined): Record<string, OpenApiResponse> {
  if (definitions === undefined) {
    return {
      "200": {
        description: "Success",
      },
    };
  }

  const responses: Record<string, OpenApiResponse> = {};

  for (const [statusCode, definition] of Object.entries(definitions)) {
    if (definition === undefined) {
      continue;
    }

    responses[statusCode] = createResponse(Number(statusCode), definition);
  }

  return responses;
}

function createResponse(statusCode: number, definition: ActionResponseDefinitionValue): OpenApiResponse {
  if (isActionErrorDefinition(definition)) {
    return {
      description: definition.message,
      content: {
        "application/json": {
          schema: toErrorResponseSchema(definition),
        },
      },
    };
  }

  return {
    description: describeStatusCode(statusCode),
    content: {
      "application/json": {
        schema: toOpenApiSchema(definition),
      },
    },
  };
}

function createOperationId(method: HttpMethod, path: string): string {
  const parts = path
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/^:/, "by-"));

  return [method.toLowerCase(), ...parts].join("-");
}

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function describeStatusCode(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) {
    return "Success";
  }

  if (statusCode >= 400 && statusCode < 500) {
    return "Client error";
  }

  if (statusCode >= 500) {
    return "Server error";
  }

  return `HTTP ${statusCode}`;
}
