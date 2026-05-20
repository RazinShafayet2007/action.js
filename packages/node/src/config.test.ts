import { z } from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";

import { action, defineConfig } from "@action-js/core";

import { createActionApp } from "./app.js";

describe("config integration", () => {
  it("injects resolved config into action context", async () => {
    const config = defineConfig({
      env: z.object({
        DATABASE_URL: z.string().url(),
      }),
    });

    const app = createActionApp({
      config,
      env: {
        DATABASE_URL: "https://database.example.com",
      },
    }).action(
      action({
        method: "GET",
        path: "/config",
        response: {
          200: z.object({
            databaseUrl: z.string(),
          }),
        },
        handler: ({ config }) => ({
          status: 200 as const,
          body: {
            databaseUrl: config.env.DATABASE_URL,
          },
        }),
      }),
    );

    const response = await app.fetch(new Request("http://localhost/config"));

    await expect(response.json()).resolves.toEqual({
      databaseUrl: "https://database.example.com",
    });
  });

  it("throws at app creation when env validation fails", () => {
    const config = defineConfig({
      env: z.object({
        JWT_SECRET: z.string().min(8),
      }),
    });

    expect(() =>
      createActionApp({
        config,
        env: {
          JWT_SECRET: "short",
        },
      }),
    ).toThrowError(/Action\.js config error/);
  });

  it("keeps app.config separate from user-defined context config fields", async () => {
    const app = createActionApp()
      .use(async (context, next) => {
        context.setContext({
          config: {
            source: "plugin",
          },
        });

        return next();
      })
      .action(
        action({
          method: "GET",
          path: "/plugin-config",
          response: {
            200: z.object({
              source: z.string(),
            }),
          },
          handler: ({ config }) => ({
            status: 200 as const,
            body: {
              source: config.source,
            },
          }),
        }),
      );

    expectTypeOf(app.config).toEqualTypeOf<undefined>();
    expect(app.config).toBeUndefined();

    const response = await app.fetch(new Request("http://localhost/plugin-config"));

    await expect(response.json()).resolves.toEqual({
      source: "plugin",
    });
  });

  it("rejects attempts to overwrite reserved config context when app config is enabled", async () => {
    const config = defineConfig({
      env: z.object({
        API_URL: z.string().url(),
      }),
    });

    const app = createActionApp({
      config,
      env: {
        API_URL: "https://api.example.com",
      },
    })
      .use(async (context, next) => {
        context.setContext({
          config: {
            env: {
              API_URL: "https://evil.example.com",
            },
          },
        });

        return next();
      })
      .action(
        action({
          method: "GET",
          path: "/collision",
          handler: ({ config }) => ({
            status: 200 as const,
            body: {
              apiUrl: config.env.API_URL,
            },
          }),
        }),
      );

    await expect(app.fetch(new Request("http://localhost/collision"))).rejects.toThrow(
      /reserved by Action\.js when app config is enabled/,
    );
  });
});
