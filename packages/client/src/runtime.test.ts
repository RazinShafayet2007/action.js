import { z } from "zod";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { action, defineError } from "@action-js/core";

import { ActionClientError, createClient, isActionClientError } from "./index.js";

describe("createClient", () => {
  it("mirrors nested action trees and builds params/query requests", async () => {
    const getUser = action({
      method: "GET",
      path: "/users/:id",
      params: z.object({
        id: z.string(),
      }),
      query: z.object({
        includePosts: z.boolean(),
      }),
      response: {
        200: z.object({
          id: z.string(),
          name: z.string(),
        }),
      },
      handler: ({ params }) => ({
        status: 200,
        body: {
          id: params.id,
          name: "Ada",
        },
      }),
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://api.actionjs.dev/users/123?includePosts=true");

      return new Response(JSON.stringify({ id: "123", name: "Ada" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const client = createClient({
      baseUrl: "https://api.actionjs.dev",
      actions: {
        users: {
          get: getUser,
        },
      },
      fetch: fetchMock as typeof fetch,
    });

    expectTypeOf(client.users.get).toBeFunction();

    const user = await client.users.get({
      params: { id: "123" },
      query: { includePosts: true },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(user).toEqual({ id: "123", name: "Ada" });
  });

  it("serializes JSON request bodies for mutation actions", async () => {
    const createPost = action({
      method: "POST",
      path: "/posts",
      body: z.object({
        title: z.string(),
      }),
      response: {
        201: z.object({
          id: z.string(),
          title: z.string(),
        }),
      },
      handler: ({ body }) => ({
        status: 201,
        body: {
          id: "post_1",
          title: body.title,
        },
      }),
    });

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ title: "Hello" }));
      expect(new Headers(init?.headers).get("content-type")).toBe("application/json");

      return new Response(JSON.stringify({ id: "post_1", title: "Hello" }), {
        status: 201,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const client = createClient({
      baseUrl: "https://api.actionjs.dev",
      actions: {
        posts: {
          create: createPost,
        },
      },
      fetch: fetchMock as typeof fetch,
    });

    const post = await client.posts.create({
      body: { title: "Hello" },
    });

    expect(post).toEqual({ id: "post_1", title: "Hello" });
  });

  it("throws typed client errors for declared error responses", async () => {
    const userNotFound = defineError("USER_NOT_FOUND", {
      status: 404,
      message: "User not found",
      details: z.object({
        userId: z.string(),
      }),
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

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "USER_NOT_FOUND",
            message: "User not found",
            details: {
              userId: "missing",
            },
            requestId: "req_123",
          },
        }),
        {
          status: 404,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    const client = createClient({
      baseUrl: "https://api.actionjs.dev",
      actions: {
        users: {
          get: getUser,
        },
      },
      fetch: fetchMock as typeof fetch,
    });

    await expect(client.users.get({ params: { id: "missing" } })).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
      status: 404,
      details: {
        userId: "missing",
      },
      requestId: "req_123",
    });

    try {
      await client.users.get({ params: { id: "missing" } });
    } catch (error) {
      expect(error).toBeInstanceOf(ActionClientError);
      expect(isActionClientError(error)).toBe(true);
    }
  });
});
