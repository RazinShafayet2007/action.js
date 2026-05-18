export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string | undefined;
}

export interface OpenApiServer {
  url: string;
  description?: string | undefined;
}

export interface OpenApiSchema {
  [key: string]: unknown;
}

export interface OpenApiParameter {
  name: string;
  in: "path" | "query";
  required: boolean;
  description?: string | undefined;
  schema: OpenApiSchema;
}

export interface OpenApiResponse {
  description: string;
  content?: {
    "application/json": {
      schema: OpenApiSchema;
    };
  };
}

export interface OpenApiOperation {
  operationId: string;
  parameters?: OpenApiParameter[] | undefined;
  requestBody?: {
    required: boolean;
    content: {
      "application/json": {
        schema: OpenApiSchema;
      };
    };
  } | undefined;
  responses: Record<string, OpenApiResponse>;
}

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: OpenApiInfo;
  servers?: OpenApiServer[] | undefined;
  paths: Record<string, Partial<Record<Lowercase<string>, OpenApiOperation>>>;
}
