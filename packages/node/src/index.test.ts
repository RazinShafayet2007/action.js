import { z } from "zod";
import { describe, expect, it } from "vitest";

import { action } from "@action-js/core";

import { createActionApp } from "./index.js";

describe("createActionApp", () => {
  it("parses and validates params, query, and json bodies before invoking handlers", async () => {
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

  it("returns a validation error when a schema check fails", async () => {
    const app = createActionApp().action(
      action({
        method: "GET",
        path: "/users",
        query: z.object({
          page: z.coerce.number().int().positive(),
        }),
        handler: ({ query }) => ({
          status: 200,
          body: query,
        }),
      }),
    );

    const response = await app.fetch(new Request("http://localhost/users?page=not-a-number"));

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(payload.error.message).toBe("Invalid request input");
    expect(payload.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "query.page",
          message: expect.any(String),
        }),
      ]),
    );
  });

  it("returns a validation error for malformed json bodies", async () => {
    const app = createActionApp().action(
      action({
        method: "POST",
        path: "/posts",
        body: z.object({
          title: z.string(),
        }),
        handler: ({ body }) => ({
          status: 201,
          body,
        }),
      }),
    );

    const response = await app.fetch(
      new Request("http://localhost/posts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{bad json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request input",
        issues: [
          {
            path: "body",
            message: "Invalid JSON body",
          },
        ],
      },
    });
  });

  it("returns a 404 json response when no action matches", async () => {
    const app = createActionApp();

    const response = await app.fetch(new Request("http://localhost/missing"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ACTION_NOT_FOUND",
        message: "No action matched GET /missing",
      },
    });
  });

  it("passes Response objects through without reserializing them", async () => {
    const app = createActionApp({
      actions: [
        action({
          method: "GET",
          path: "/health",
          handler: () => new Response("ok", { status: 200 }),
        }),
      ],
    });

    const response = await app.fetch(new Request("http://localhost/health/"));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("ok");
  });

  it("returns a 500 json response when a handler throws", async () => {
    const app = createActionApp().action(
      action({
        method: "GET",
        path: "/boom",
        handler: () => {
          throw new Error("boom");
        },
      }),
    );

    const response = await app.fetch(new Request("http://localhost/boom"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      },
    });
  });
});
