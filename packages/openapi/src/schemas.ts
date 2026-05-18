import type { ActionErrorDefinition, SchemaLike } from "@action-js/core";
import { ZodType } from "zod";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { OpenApiSchema } from "./types.js";

export function toOpenApiSchema(schema: unknown): OpenApiSchema {
  if (isZodSchema(schema)) {
    const jsonSchema = zodToJsonSchema(schema, {
      target: "openApi3",
      $refStrategy: "none",
    }) as OpenApiSchema;

    delete jsonSchema.$schema;

    return jsonSchema;
  }

  if (isSchemaLike(schema)) {
    return {};
  }

  return {};
}

export function toErrorResponseSchema(definition: ActionErrorDefinition): OpenApiSchema {
  const detailsSchema = definition.details === undefined ? undefined : toOpenApiSchema(definition.details);
  const metadataSchema = definition.metadata === undefined ? undefined : toOpenApiSchema(definition.metadata);

  const errorProperties: Record<string, OpenApiSchema> = {
    code: {
      type: "string",
      enum: [definition.code],
    },
    message: {
      type: "string",
      example: definition.message,
    },
    requestId: {
      type: "string",
    },
  };

  if (detailsSchema !== undefined) {
    errorProperties.details = detailsSchema;
  }

  if (metadataSchema !== undefined) {
    errorProperties.metadata = metadataSchema;
  }

  return {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: errorProperties,
      },
    },
  };
}

export function getObjectSchemaProperties(schema: unknown): {
  properties: Record<string, OpenApiSchema>;
  required: string[];
} {
  const openApiSchema = toOpenApiSchema(schema);
  const properties = isRecord(openApiSchema.properties) ? (openApiSchema.properties as Record<string, OpenApiSchema>) : {};
  const required = Array.isArray(openApiSchema.required)
    ? openApiSchema.required.filter((value): value is string => typeof value === "string")
    : [];

  return {
    properties,
    required,
  };
}

export function isOptionalSchema(schema: unknown): boolean {
  return isZodSchema(schema) ? schema.safeParse(undefined).success : false;
}

function isZodSchema(value: unknown): value is ZodTypeAny {
  return value instanceof ZodType;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSchemaLike(value: unknown): value is SchemaLike<unknown> {
  return typeof value === "object" && value !== null && "safeParse" in value;
}
