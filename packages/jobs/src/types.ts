import type { InferSchemaOutput, SchemaIssue, SchemaLike } from "@action-js/core";

export interface JobRetryOptions {
  attempts: number;
}

export interface JobContext<TServices, TInput> {
  services: TServices;
  input: TInput;
}

export interface JobDefinition<TName extends string = string, TServices = unknown, TInputSchema = unknown> {
  readonly kind: "job";
  readonly name: TName;
  readonly input?: TInputSchema | undefined;
  readonly retry?: JobRetryOptions | undefined;
  readonly handler: (context: JobContext<TServices, InferSchemaOutput<TInputSchema, unknown>>) => Promise<void> | void;
}

export interface JobOptions<TName extends string, TServices, TInputSchema> {
  name: TName;
  input?: TInputSchema | undefined;
  retry?: JobRetryOptions | undefined;
  handler: (context: JobContext<TServices, InferSchemaOutput<TInputSchema, unknown>>) => Promise<void> | void;
}

export interface EnqueuedJob<TJob extends JobDefinition<any, any, any> = JobDefinition<any, any, any>> {
  id: string;
  definition: TJob;
  input: InferSchemaOutput<TJob["input"], unknown>;
  attempts: number;
}

export class JobValidationError extends Error {
  readonly issues: ReadonlyArray<SchemaIssue>;

  constructor(jobName: string, issues: ReadonlyArray<SchemaIssue>) {
    super(formatJobValidationError(jobName, issues));
    this.name = "JobValidationError";
    this.issues = issues;
  }
}

export function isSchemaLike(value: unknown): value is SchemaLike<unknown> {
  return typeof value === "object" && value !== null && "safeParse" in value;
}

function formatJobValidationError(jobName: string, issues: ReadonlyArray<SchemaIssue>): string {
  const formatted = issues
    .map((issue) => `- ${issue.path.map((segment) => String(segment)).join(".") || "(root)"}: ${issue.message}`)
    .join("\n");

  return `Invalid input for job '${jobName}'\n\n${formatted}`;
}
