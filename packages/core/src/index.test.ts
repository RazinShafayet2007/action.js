import { z } from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";

import { action, type ActionContext } from "./index.js";

describe("action", () => {
  it("creates an action definition with method and path metadata", async () => {
    const getUser = action({
      method: "GET",
      path: "/users/:id",
      handler: async ({ params }) => ({
        status: 200,
        body: { id: params.id },
      }),
    });

    expect(getUser.kind).toBe("action");
    expect(getUser.method).toBe("GET");
    expect(getUser.path).toBe("/users/:id");

    const result = await getUser.handler({
      request: new Request("http://localhost/users/123"),
      params: { id: "123" },
      query: {
        active: "true",
      },
      body: undefined,
      services: {},
    });

    expect(result).toEqual({
      status: 200,
      body: { id: "123" },
    });
  });

  it("infers params from the path and carries service types into the handler", () => {
    const createGreeting = action({
      method: "GET",
      path: "/teams/:teamId/users/:userId",
      handler: ({ params, services }: ActionContext<
        "/teams/:teamId/users/:userId",
        { greeting: string }
      >) => ({
        status: 200,
        body: `${services.greeting} ${params.teamId}/${params.userId}`,
      }),
    });

    expectTypeOf(createGreeting.handler).parameters.toEqualTypeOf<[
      ActionContext<"/teams/:teamId/users/:userId", { greeting: string }>,
    ]>();
  });

  it("infers handler params, query, and body from schemas", () => {
    const createPost = action({
      method: "POST",
      path: "/teams/:teamId/posts",
      params: z.object({
        teamId: z.string(),
      }),
      query: z.object({
        page: z.coerce.number(),
        search: z.string().optional(),
      }),
      body: z.object({
        title: z.string(),
        published: z.boolean(),
      }),
      handler: ({ params, query, body }) => ({
        status: 201,
        body: {
          teamId: params.teamId,
          page: query.page,
          search: query.search,
          title: body.title,
          published: body.published,
        },
      }),
    });

    expectTypeOf<Parameters<typeof createPost.handler>[0]["params"]>().toEqualTypeOf<{
      teamId: string;
    }>();

    expectTypeOf<Parameters<typeof createPost.handler>[0]["query"]>().toEqualTypeOf<{
      page: number;
      search?: string | undefined;
    }>();

    expectTypeOf<Parameters<typeof createPost.handler>[0]["body"]>().toEqualTypeOf<{
      title: string;
      published: boolean;
    }>();
  });
});
