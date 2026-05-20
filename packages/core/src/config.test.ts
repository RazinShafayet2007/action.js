import { z } from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";

import { ConfigValidationError, defineConfig, resolveConfig } from "./index.js";

describe("config", () => {
  it("resolves typed env values from a schema", () => {
    const config = defineConfig({
      env: z.object({
        DATABASE_URL: z.string().url(),
        PORT: z.coerce.number().int().positive(),
      }),
    });

    const resolved = resolveConfig(config, {
      DATABASE_URL: "https://database.example.com",
      PORT: "3000",
    });

    expectTypeOf(resolved.env.DATABASE_URL).toEqualTypeOf<string>();
    expectTypeOf(resolved.env.PORT).toEqualTypeOf<number>();
    expect(resolved).toEqual({
      env: {
        DATABASE_URL: "https://database.example.com",
        PORT: 3000,
      },
    });
  });

  it("throws a ConfigValidationError for invalid env values", () => {
    const config = defineConfig({
      env: z.object({
        DATABASE_URL: z.string().url(),
      }),
    });

    expect(() =>
      resolveConfig(config, {
        DATABASE_URL: "not-a-url",
      }),
    ).toThrow(ConfigValidationError);
  });
});
