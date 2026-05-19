import { z } from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";

import { action } from "@action-js/core";
import { createActionApp } from "@action-js/node";
import { createTestApp } from "@action-js/testing";

import { ForbiddenError, UnauthorizedError, authPlugin, authorize, policy, requireUser } from "./index.js";

describe("@action-js/auth", () => {
  it("injects typed user context from the auth plugin resolver", async () => {
    const app = createActionApp({
      services: {
        users: {
          getByToken(token: string) {
            return token === "Bearer secret"
              ? {
                  id: "user_1",
                  email: "ada@example.com",
                  roles: ["admin"],
                }
              : null;
          },
        },
      },
    })
      .plugin(
        authPlugin({
          resolve: async ({ request, services }) => {
            const token = request.headers.get("authorization");
            const user = token ? services.users.getByToken(token) : null;

            return user ? { user } : null;
          },
        }),
      )
      .action(
        action({
          method: "GET",
          path: "/me",
          response: {
            200: z.object({
              id: z.string(),
              email: z.string(),
            }),
          },
          handler: requireUser(({ user }) => ({
            status: 200,
            body: {
              id: user.id,
              email: user.email ?? "",
            },
          })),
        }),
      );

    const testApp = createTestApp(app);
    const response = await testApp.get("/me").headers({ authorization: "Bearer secret" });

    expectTypeOf(response.body).toEqualTypeOf<unknown>();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: "user_1",
      email: "ada@example.com",
    });
  });

  it("returns unauthorized when requireUser is used without an authenticated user", async () => {
    const app = createActionApp()
      .plugin(
        authPlugin({
          resolve: async () => null,
        }),
      )
      .action(
        action({
          method: "GET",
          path: "/private",
          response: {
            200: z.object({ ok: z.boolean() }),
            401: UnauthorizedError,
          },
          handler: requireUser(() => ({
            status: 200,
            body: { ok: true },
          })),
        }),
      );

    const response = await createTestApp(app).get("/private");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  });

  it("returns forbidden when authorization policy denies access", async () => {
    const canManageProject = policy("project.manage", async ({ user }: { user: { roles?: string[] } }) => {
      return user.roles?.includes("admin") ?? false;
    });

    const app = createActionApp()
      .plugin(
        authPlugin({
          resolve: async () => ({
            user: {
              id: "user_2",
              roles: ["member"],
            },
          }),
        }),
      )
      .action(
        action({
          method: "POST",
          path: "/projects/manage",
          response: {
            200: z.object({ ok: z.boolean() }),
            401: UnauthorizedError,
            403: ForbiddenError,
          },
          handler: authorize(canManageProject, () => ({
            status: 200,
            body: { ok: true },
          })),
        }),
      );

    const response = await createTestApp(app).post("/projects/manage");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "You do not have access to this resource",
      },
    });
  });

  it("allows policies to pass through authenticated user context", async () => {
    const canManageProject = policy(
      "project.manage",
      async ({ user, params }: { user: { id: string; roles?: string[] }; params: { id: string } }) => {
        return user.id === params.id || user.roles?.includes("admin") === true;
      },
    );

    const app = createActionApp()
      .plugin(
        authPlugin({
          resolve: async () => ({
            user: {
              id: "owner_1",
              roles: ["member"],
            },
            session: {
              token: "secret",
            },
          }),
        }),
      )
      .action(
        action({
          method: "GET",
          path: "/projects/:id",
          params: z.object({
            id: z.string(),
          }),
          response: {
            200: z.object({
              projectId: z.string(),
              ownerId: z.string(),
            }),
            401: UnauthorizedError,
            403: ForbiddenError,
          },
          handler: authorize(canManageProject, ({ params, user, session }) => {
            expectTypeOf(user.id).toEqualTypeOf<string>();
            expectTypeOf(session).toEqualTypeOf<{ token: string } | null>();

            return {
              status: 200 as const,
              body: {
                projectId: params.id,
                ownerId: user.id,
              },
            };
          }),
        }),
      );

    const response = await createTestApp(app).get("/projects/owner_1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      projectId: "owner_1",
      ownerId: "owner_1",
    });
  });
});
