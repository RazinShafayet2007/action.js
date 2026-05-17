import { describe, expect, expectTypeOf, it } from "vitest";

import { action } from "@action-js/core";

import { createActionApp, requestId, type MiddlewareHandler } from "./index.js";

describe("middleware", () => {
  it("runs middleware in order and injects typed context into handlers", async () => {
    const order: string[] = [];

    const withCurrentUser: MiddlewareHandler<
      { prefix: string },
      { requestId: string },
      { currentUser: { id: string } }
    > = async (context, next) => {
      order.push(`before-user:${context.requestId}`);
      context.setContext({
        currentUser: { id: "user_1" },
      });

      const response = await next();
      order.push(`after-user:${context.requestId}`);
      response.headers.set("x-user-middleware", "true");

      return response;
    };

    const app = createActionApp({
      services: {
        prefix: "hello",
      },
    })
      .use(requestId({ generator: () => "req_test" }))
      .use(withCurrentUser)
      .action(
        action({
          method: "GET",
          path: "/me",
          handler: ({ currentUser, requestId, services }) => ({
            status: 200,
            body: {
              userId: currentUser.id,
              requestId,
              greeting: `${services.prefix} ${currentUser.id}`,
            },
          }),
        }),
      );

    expectTypeOf<Parameters<typeof withCurrentUser>[0]["requestId"]>().toEqualTypeOf<string>();

    const response = await app.fetch(new Request("http://localhost/me"));

    expect(order).toEqual(["before-user:req_test", "after-user:req_test"]);
    expect(response.headers.get("x-request-id")).toBe("req_test");
    expect(response.headers.get("x-user-middleware")).toBe("true");
    await expect(response.json()).resolves.toEqual({
      userId: "user_1",
      requestId: "req_test",
      greeting: "hello user_1",
    });
  });

  it("allows middleware to short-circuit requests", async () => {
    let handlerCalled = false;

    const app = createActionApp()
      .use(requestId({ generator: () => "req_blocked" }))
      .use(async (context) => {
        return new Response(JSON.stringify({ blocked: true, requestId: context.requestId }), {
          status: 401,
          headers: {
            "content-type": "application/json",
          },
        });
      })
      .action(
        action({
          method: "GET",
          path: "/private",
          handler: () => {
            handlerCalled = true;
            return {
              status: 200,
              body: { ok: true },
            };
          },
        }),
      );

    const response = await app.fetch(new Request("http://localhost/private"));

    expect(handlerCalled).toBe(false);
    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).toBe("req_blocked");
    await expect(response.json()).resolves.toEqual({
      blocked: true,
      requestId: "req_blocked",
    });
  });

  it("includes requestId in framework error responses when requestId middleware is used", async () => {
    const app = createActionApp().use(requestId({ generator: () => "req_missing" }));

    const response = await app.fetch(new Request("http://localhost/missing"));

    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-id")).toBe("req_missing");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ACTION_NOT_FOUND",
        message: "No action matched GET /missing",
        requestId: "req_missing",
      },
    });
  });
});
