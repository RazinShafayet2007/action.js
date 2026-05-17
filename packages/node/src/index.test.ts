import { describe, expect, it } from "vitest";

import { action } from "@action-js/core";

import { createActionApp } from "./index.js";

describe("createActionApp", () => {
  it("matches actions, injects params and services, and serializes json bodies", async () => {
    const app = createActionApp({
      services: {
        prefix: "hello",
      },
    }).action(
      action({
        method: "GET",
        path: "/users/:id",
        handler: ({ params, query, services }) => ({
          status: 200,
          body: {
            id: params.id,
            expanded: query.get("expanded"),
            message: `${services.prefix} ${params.id}`,
          },
        }),
      }),
    );

    const response = await app.fetch(new Request("http://localhost/users/123?expanded=true"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      id: "123",
      expanded: "true",
      message: "hello 123",
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
