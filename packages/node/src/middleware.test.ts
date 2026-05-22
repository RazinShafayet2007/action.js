import { describe, expect, expectTypeOf, it } from "vitest";

import { action } from "@action-js/core";

import { createActionApp, cors, requestId, securityHeaders, type MiddlewareHandler } from "./index.js";

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

  it("applies CORS headers for allowed origins", async () => {
    const app = createActionApp()
      .use(
        cors({
          origin: ["https://frontend.example.com"],
          credentials: true,
          exposedHeaders: ["x-request-id"],
        }),
      )
      .action(
        action({
          method: "GET",
          path: "/posts",
          handler: () => ({
            status: 200,
            body: { ok: true },
            headers: {
              "x-request-id": "req_cors",
            },
          }),
        }),
      );

    const response = await app.fetch(
      new Request("http://localhost/posts", {
        headers: {
          origin: "https://frontend.example.com",
        },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("https://frontend.example.com");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-expose-headers")).toBe("x-request-id");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("does not apply CORS headers for denied origins", async () => {
    const app = createActionApp()
      .use(
        cors({
          origin: ["https://allowed.example.com"],
        }),
      )
      .action(
        action({
          method: "GET",
          path: "/posts",
          handler: () => ({
            status: 200,
            body: { ok: true },
          }),
        }),
      );

    const response = await app.fetch(
      new Request("http://localhost/posts", {
        headers: {
          origin: "https://blocked.example.com",
        },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("handles preflight requests automatically", async () => {
    const app = createActionApp()
      .use(
        cors({
          origin: true,
          methods: ["GET", "POST"],
          allowedHeaders: ["content-type", "authorization"],
          maxAge: 600,
        }),
      )
      .action(
        action({
          method: "GET",
          path: "/posts",
          handler: () => ({
            status: 200,
            body: { ok: true },
          }),
        }),
      );

    const response = await app.fetch(
      new Request("http://localhost/posts", {
        method: "OPTIONS",
        headers: {
          origin: "https://frontend.example.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type, authorization",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://frontend.example.com");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, POST");
    expect(response.headers.get("access-control-allow-headers")).toBe("content-type, authorization");
    expect(response.headers.get("access-control-max-age")).toBe("600");
  });

  it("applies default security headers", async () => {
    const app = createActionApp()
      .use(securityHeaders())
      .action(
        action({
          method: "GET",
          path: "/secure",
          handler: () => ({
            status: 200,
            body: { ok: true },
          }),
        }),
      );

    const response = await app.fetch(new Request("http://localhost/secure"));

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("permissions-policy")).toBe("camera=(), geolocation=(), microphone=()");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("allows overriding and disabling security headers", async () => {
    const app = createActionApp()
      .use(
        securityHeaders({
          frameOptions: "SAMEORIGIN",
          referrerPolicy: "strict-origin-when-cross-origin",
          permissionsPolicy: false,
        }),
      )
      .action(
        action({
          method: "GET",
          path: "/secure",
          handler: () => ({
            status: 200,
            body: { ok: true },
          }),
        }),
      );

    const response = await app.fetch(new Request("http://localhost/secure"));

    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toBeNull();
  });

  it("does not overwrite security headers already set by the response", async () => {
    const app = createActionApp()
      .use(securityHeaders())
      .action(
        action({
          method: "GET",
          path: "/secure",
          handler: () => ({
            status: 200,
            body: { ok: true },
            headers: {
              "x-frame-options": "SAMEORIGIN",
              "referrer-policy": "origin",
            },
          }),
        }),
      );

    const response = await app.fetch(new Request("http://localhost/secure"));

    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("referrer-policy")).toBe("origin");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
