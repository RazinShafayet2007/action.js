import { z } from "zod";
import { describe, expect, it } from "vitest";

import { action, defineError } from "@action-js/core";

import { createOpenApiDocument } from "./index.js";

describe("createOpenApiDocument", () => {
  it("generates paths, params, query, body, and success responses from actions", () => {
    const createPost = action({
      method: "POST",
      path: "/users/:id/posts",
      params: z.object({
        id: z.string(),
      }),
      query: z.object({
        page: z.coerce.number().default(1),
        search: z.string().optional(),
      }),
      body: z.object({
        title: z.string().min(1),
        content: z.string(),
      }),
      response: {
        201: z.object({
          id: z.string(),
          title: z.string(),
        }),
      },
      handler: ({ params, body }) => ({
        status: 201,
        body: {
          id: params.id,
          title: body.title,
        },
      }),
    });

    const document = createOpenApiDocument({
      info: {
        title: "Action.js API",
        version: "0.1.0",
      },
      actions: [createPost],
    });

    expect(document.paths["/users/{id}/posts"]?.post).toMatchObject({
      operationId: "post-users-by-id-posts",
      parameters: expect.arrayContaining([
        expect.objectContaining({
          name: "id",
          in: "path",
          required: true,
        }),
        expect.objectContaining({
          name: "page",
          in: "query",
          required: false,
        }),
        expect.objectContaining({
          name: "search",
          in: "query",
          required: false,
        }),
      ]),
      requestBody: expect.objectContaining({
        required: true,
      }),
      responses: {
        "201": expect.objectContaining({
          description: "Success",
        }),
      },
    });

    expect(document.paths["/users/{id}/posts"]?.post?.requestBody?.content["application/json"].schema).toMatchObject({
      type: "object",
      properties: {
        title: expect.any(Object),
        content: expect.any(Object),
      },
    });
  });

  it("generates typed error responses from action error definitions", () => {
    const userNotFound = defineError("USER_NOT_FOUND", {
      status: 404,
      message: "User not found",
      details: z.object({
        userId: z.string(),
      }),
      metadata: z.object({
        source: z.string(),
      }),
    });

    const getUser = action({
      method: "GET",
      path: "/users/:id",
      response: {
        200: z.object({
          id: z.string(),
        }),
        404: userNotFound,
      },
      handler: ({ params }) => ({
        status: 200,
        body: {
          id: params.id,
        },
      }),
    });

    const document = createOpenApiDocument({
      info: {
        title: "Action.js API",
        version: "0.1.0",
      },
      actions: [getUser],
    });

    expect(document.paths["/users/{id}"]?.get?.responses["404"]).toMatchObject({
      description: "User not found",
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["error"],
            properties: {
              error: {
                type: "object",
                required: ["code", "message"],
                properties: {
                  code: {
                    enum: ["USER_NOT_FOUND"],
                  },
                  message: {
                    example: "User not found",
                  },
                  details: {
                    type: "object",
                  },
                  metadata: {
                    type: "object",
                  },
                  requestId: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
      },
    });
  });
});
