import { z } from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";

import { action } from "@action-js/core";
import { createActionApp } from "@action-js/node";
import { createTestApp } from "@action-js/testing";

import { drizzlePlugin } from "./index.js";

describe("drizzlePlugin", () => {
  it("injects the exact db instance into action context", async () => {
    const db = {
      query: {
        users: {
          async findMany() {
            return [{ id: "user_1", name: "Ada" }];
          },
        },
      },
      async transaction<T>(callback: (tx: { commit: () => Promise<void> }) => Promise<T>) {
        return callback({
          async commit() {
            return;
          },
        });
      },
    };

    const app = createActionApp()
      .plugin(drizzlePlugin({ db }))
      .action(
        action({
          method: "GET",
          path: "/users",
          response: {
            200: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
              }),
            ),
          },
          handler: async ({ db }) => {
            expectTypeOf(db).toEqualTypeOf<typeof db>();

            return {
              status: 200 as const,
              body: await db.query.users.findMany(),
            };
          },
        }),
      );

    const response = await createTestApp(app).get("/users");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: "user_1", name: "Ada" }]);
  });

  it("works with additional services and context plugins", async () => {
    const db = {
      query: {
        projects: {
          async findFirst() {
            return { id: "project_1", ownerId: "user_1" };
          },
        },
      },
    };

    const app = createActionApp({
      services: {
        audit(message: string) {
          return `audit:${message}`;
        },
      },
    })
      .plugin(drizzlePlugin({ db }))
      .action(
        action({
          method: "GET",
          path: "/projects/first",
          response: {
            200: z.object({
              id: z.string(),
              audit: z.string(),
            }),
          },
          handler: async ({ db, services }) => {
            const project = await db.query.projects.findFirst();

            return {
              status: 200 as const,
              body: {
                id: project.id,
                audit: services.audit(project.id),
              },
            };
          },
        }),
      );

    const response = await createTestApp(app).get("/projects/first");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: "project_1",
      audit: "audit:project_1",
    });
  });
});
