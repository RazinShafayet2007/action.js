import { z } from "zod";
import { describe, expect, it } from "vitest";

import { action, actionError, defineError } from "@action-js/core";
import { createActionApp } from "@action-js/node";

import { createTestApp } from "./index.js";

describe("createTestApp", () => {
  it("sends JSON request bodies and parses JSON success responses", async () => {
    const app = createActionApp().action(
      action({
        method: "POST",
        path: "/posts",
        body: z.object({
          title: z.string(),
        }),
        response: {
          201: z.object({
            id: z.string(),
            title: z.string(),
          }),
        },
        handler: ({ body }) => ({
          status: 201,
          body: {
            id: "post_1",
            title: body.title,
          },
        }),
      }),
    );

    const testApp = createTestApp(app);
    const response = await testApp.post("/posts").body({ title: "Hello" });

    expect(response.status).toBe(201);
    expect(response.ok).toBe(true);
    expect(response.body).toEqual({
      id: "post_1",
      title: "Hello",
    });
  });

  it("parses validation error payloads from failed requests", async () => {
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

    const testApp = createTestApp(app);
    const response = await testApp.get("/users").query({ page: "nope" });

    expect(response.status).toBe(400);
    expect(response.ok).toBe(false);
    expect(response.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request input",
      },
    });
  });

  it("parses declared framework error responses", async () => {
    const userNotFound = defineError("USER_NOT_FOUND", {
      status: 404,
      message: "User not found",
      details: z.object({
        userId: z.string(),
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
          });
        },
      }),
    );

    const testApp = createTestApp(app);
    const response = await testApp.get("/users/missing");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "USER_NOT_FOUND",
        message: "User not found",
        details: {
          userId: "missing",
        },
      },
    });
  });

  it("parses text responses and supports explicit text bodies", async () => {
    const app = createActionApp().action(
      action({
        method: "POST",
        path: "/echo",
        handler: async ({ request }) => {
          return new Response(await request.text(), {
            status: 200,
            headers: {
              "content-type": "text/plain; charset=utf-8",
            },
          });
        },
      }),
    );

    const testApp = createTestApp(app);
    const response = await testApp.post("/echo").text("hello");

    expect(response.status).toBe(200);
    expect(response.body).toBe("hello");
    expect(response.rawText).toBe("hello");
  });
});
