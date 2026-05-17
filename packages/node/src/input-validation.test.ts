import { z } from "zod";
import { describe, expect, it } from "vitest";

import { action } from "@action-js/core";

import { createActionApp } from "./index.js";

describe("request validation", () => {
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
});
