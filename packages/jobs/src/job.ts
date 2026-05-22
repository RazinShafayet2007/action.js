import type { JobDefinition, JobOptions } from "./types.js";

export function job<TName extends string, TServices = Record<string, never>, TInputSchema = undefined>(
  options: JobOptions<TName, TServices, TInputSchema>,
): JobDefinition<TName, TServices, TInputSchema> {
  return {
    kind: "job",
    name: options.name,
    input: options.input,
    retry: options.retry,
    handler: options.handler,
  };
}
