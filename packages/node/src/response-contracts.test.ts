import { z } from "zod";
import { describe, expect, it } from "vitest";

import { action, actionError, defineError } from "@action-js/core";

import { createActionApp } from "./index.js";

describe("response contracts", () => {
  it("parses and validates params, query, json bodies, and response bodies", async () => {
    const app = createActionApp({
      services: {
        prefix: "hello",
      },
    }).action(
      action({
        method: "POST",
        path: "/users/:id/posts",
        params: z.object({
          id: z.string().min(3),
        }),
        query: z.object({
          page: z.coerce.number().int().positive(),
          published: z.coerce.boolean().default(false),
        }),
        body: z.object({
          title: z.string().min(1),
          content: z.string().min(1),
        }),
        response: {
          201: z.object({
            id: z.string(),
            page: z.number(),
            published: z.boolean(),
            title: z.string(),
            content: z.string(),
            message: z.string(),
          }),
        },
        handler: ({ params, query, body, services }) => ({
          status: 201,
          body: {
            id: params.id,
            page: query.page,
            published: query.published,
            title: body.title,
            content: body.content,
            message: `${services.prefix} ${params.id}`,
          },
        }),
      }),
    );

    const response = await app.fetch(
      new Request("http://localhost/users/123/posts?page=2&published=true", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Hello",
          content: "World",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      id: "123",
      page: 2,
      published: true,
      title: "Hello",
      content: "World",
      message: "hello 123",
    });
  });

  it("serializes thrown action errors using declared error contracts", async () => {
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

    const app = createActionApp().action(
      action({
        method: "GET",
        path: "/users/:id",
        response: {
          200: z.object({
            id: z.string(),
          }),
          404: userNotFound,
        },
        handler: ({ params }) => {
          throw actionError(userNotFound, {
            details: {
              userId: params.id,
            },
            metadata: {
              source: "users",
            },
          });
        },
      }),
    );

    const response = await app.fetch(new Request("http://localhost/users/123"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "USER_NOT_FOUND",
        message: "User not found",
        details: {
          userId: "123",
        },
        metadata: {
          source: "users",
        },
      },
    });
  });

  it("returns a framework error when a handler response body breaks the declared contract", async () => {
    const app = createActionApp().action(
      action({
        method: "GET",
        path: "/broken",
        response: {
          200: z.object({
            id: z.string(),
          }),
        },
        handler: () => ({
          status: 200,
          body: {
            name: "Ada",
          },
        }),
      }),
    );

    const response = await app.fetch(new Request("http://localhost/broken"));

    expect(response.status).toBe(500);

    const payload = await response.json();

    expect(payload.error.code).toBe("INVALID_ACTION_RESPONSE");
    expect(payload.error.message).toBe("Action response does not match its declared contract");
    expect(payload.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "response.body.id",
          message: expect.any(String),
        }),
      ]),
    );
  });
});
