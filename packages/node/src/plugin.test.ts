import { z } from "zod";
import { describe, expect, it } from "vitest";

import { action } from "@action-js/core";

import { createActionApp, plugin, requestId } from "./index.js";

describe("plugins", () => {
  it("registers plugin actions, middlewares, and hooks with typed context", async () => {
    const events: string[] = [];

    const auditPlugin = plugin<
      { prefix: string },
      { requestId: string },
      { currentUser: { id: string } }
    >({
      name: "audit",
      middlewares: [
        async (context, next) => {
          events.push(`middleware:before:${context.requestId}`);
          context.setContext({
            currentUser: { id: "user_1" },
          });

          const response = await next();
          events.push(`middleware:after:${context.requestId}`);

          return response;
        },
      ],
      actions: [
        action({
          method: "GET",
          path: "/plugin/me",
          response: {
            200: z.object({
              userId: z.string(),
              requestId: z.string(),
              greeting: z.string(),
            }),
          },
          handler: ({ currentUser, requestId, services }) => ({
            status: 200,
            body: {
              userId: currentUser.id,
              requestId,
              greeting: `${services.prefix} ${currentUser.id}`,
            },
          }),
        }),
      ],
      hooks: {
        onRequest: ({ currentUser, requestId }) => {
          events.push(`request:${currentUser.id}:${requestId}`);
        },
        onResponse: ({ response, currentUser, requestId }) => {
          events.push(`response:${response.status}:${currentUser.id}:${requestId}`);
          response.headers.set("x-plugin", "audit");
        },
      },
    });

    const app = createActionApp({
      services: {
        prefix: "hello",
      },
    })
      .use(requestId({ generator: () => "req_plugin" }))
      .plugin(auditPlugin);

    expect(app.actions).toHaveLength(1);

    const response = await app.fetch(new Request("http://localhost/plugin/me"));

    expect(events).toEqual([
      "middleware:before:req_plugin",
      "request:user_1:req_plugin",
      "response:200:user_1:req_plugin",
      "middleware:after:req_plugin",
    ]);
    expect(response.headers.get("x-request-id")).toBe("req_plugin");
    expect(response.headers.get("x-plugin")).toBe("audit");
    await expect(response.json()).resolves.toEqual({
      userId: "user_1",
      requestId: "req_plugin",
      greeting: "hello user_1",
    });
  });

  it("runs plugin error hooks before serializing handler failures", async () => {
    const events: string[] = [];

    const failingPlugin = plugin<{}, { requestId: string }>({
      name: "errors",
      hooks: {
        onError: ({ error, requestId }) => {
          events.push(`${error instanceof Error ? error.message : "unknown"}:${requestId}`);
        },
      },
    });

    const app = createActionApp()
      .use(requestId({ generator: () => "req_error" }))
      .plugin(failingPlugin)
      .action(
        action({
          method: "GET",
          path: "/boom",
          handler: () => {
            throw new Error("boom");
          },
        }),
      );

    const response = await app.fetch(new Request("http://localhost/boom"));

    expect(events).toEqual(["boom:req_error"]);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
        requestId: "req_error",
      },
    });
  });
});
