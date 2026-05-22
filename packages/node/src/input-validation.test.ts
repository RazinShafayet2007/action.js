import { z } from "zod";
import { describe, expect, it } from "vitest";

import { action, webhook } from "@action-js/core";

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

  it("passes rawBody into webhook handlers and verify callbacks", async () => {
    let verifiedRawBody = "";

    const app = createActionApp().action(
      webhook({
        path: "/webhooks/stripe",
        body: z.object({
          event: z.string(),
        }),
        verify: async ({ rawBody }) => {
          verifiedRawBody = rawBody;
        },
        handler: ({ rawBody, body }) => ({
          status: 200,
          body: {
            rawBody,
            event: body.event,
          },
        }),
      }),
    );

    const response = await app.fetch(
      new Request("http://localhost/webhooks/stripe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ event: "checkout.session.completed" }),
      }),
    );

    expect(verifiedRawBody).toBe('{"event":"checkout.session.completed"}');
    await expect(response.json()).resolves.toEqual({
      rawBody: '{"event":"checkout.session.completed"}',
      event: "checkout.session.completed",
    });
  });

  it("returns a 500 response when webhook verification fails", async () => {
    const app = createActionApp().action(
      webhook({
        path: "/webhooks/stripe",
        verify: async ({ headers, rawBody }) => {
          if (headers.get("stripe-signature") !== rawBody) {
            throw new Error("Invalid signature");
          }
        },
        handler: ({ rawBody }) => ({
          status: 200,
          body: { rawBody },
        }),
      }),
    );

    const response = await app.fetch(
      new Request("http://localhost/webhooks/stripe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": "invalid",
        },
        body: JSON.stringify({ ok: true }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      },
    });
  });
});
