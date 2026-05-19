import type { PolicyDefinition } from "./types.js";

export function policy<TName extends string, TContext extends object>(
  name: TName,
  check: PolicyDefinition<TName, TContext>["check"],
): PolicyDefinition<TName, TContext> {
  return {
    kind: "policy",
    name,
    check,
  };
}
