import { z } from "zod";
import { describe, expect, it } from "vitest";

import { ActionError, actionError, defineError, isActionError } from "./index.js";

describe("action errors", () => {
  it("stores framework error definitions inside response contracts", () => {
    const userNotFound = defineError("USER_NOT_FOUND", {
      status: 404,
      message: "User not found",
      details: z.object({
        userId: z.string(),
      }),
    });

    expect(userNotFound.code).toBe("USER_NOT_FOUND");
    expect(userNotFound.status).toBe(404);
  });

  it("creates typed action errors with validated details and metadata", () => {
    const userNotFound = defineError("USER_NOT_FOUND", {
      status: 404,
      message: "User not found",
      details: z.object({
        userId: z.string(),
      }),
      metadata: z.object({
        source: z.string(),
      }),
    });

    const error = actionError(userNotFound, {
      details: {
        userId: "123",
      },
      metadata: {
        source: "users",
      },
    });

    expect(error).toBeInstanceOf(ActionError);
    expect(isActionError(error)).toBe(true);
    expect(error.code).toBe("USER_NOT_FOUND");
    expect(error.status).toBe(404);
    expect(error.message).toBe("User not found");
    expect(error.details).toEqual({ userId: "123" });
    expect(error.metadata).toEqual({ source: "users" });
  });
});
