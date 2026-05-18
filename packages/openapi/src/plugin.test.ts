import { z } from "zod";
import { describe, expect, it } from "vitest";

import { action, defineError } from "@action-js/core";
import { createActionApp } from "@action-js/node";

import { openApiPlugin } from "./index.js";

describe("openApiPlugin", () => {
  it("serves the generated OpenAPI JSON document", async () => {
    const userNotFound = defineError("USER_NOT_FOUND", {
      status: 404,
      message: "User not found",
    });

    const getUser = action({
      method: "GET",
      path: "/users/:id",
      params: z.object({
        id: z.string(),
      }),
      response: {
        200: z.object({
          id: z.string(),
        }),
        404: userNotFound,
      },
      handler: ({ params }) => ({
        status: 200,
        body: {
          id: params.id,
        },
      }),
    });

    const app = createActionApp({
      actions: [getUser],
    }).plugin(
      openApiPlugin({
        info: {
          title: "Action.js API",
          version: "0.1.0",
        },
        actions: [getUser],
      }),
    );

    const response = await app.fetch(new Request("http://localhost/openapi.json"));

    expect(response.status).toBe(200);

    const document = await response.json();

    expect(document.info).toEqual({
      title: "Action.js API",
      version: "0.1.0",
    });
    expect(document.paths["/users/{id}"].get.responses["404"].description).toBe("User not found");
  });

  it("serves a docs page that points at the OpenAPI JSON route", async () => {
    const listUsers = action({
      method: "GET",
      path: "/users",
      response: {
        200: z.array(
          z.object({
            id: z.string(),
          }),
        ),
      },
      handler: () => ({
        status: 200,
        body: [],
      }),
    });

    const app = createActionApp({
      actions: [listUsers],
    }).plugin(
      openApiPlugin({
        info: {
          title: "Action.js API",
          version: "0.1.0",
        },
        actions: [listUsers],
        docsPath: "/docs",
        jsonPath: "/spec.json",
      }),
    );

    const response = await app.fetch(new Request("http://localhost/docs"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const html = await response.text();

    expect(html).toContain("Action.js API Docs");
    expect(html).toContain("/spec.json");
  });
});
