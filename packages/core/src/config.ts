import type { InferSchemaOutput, SchemaIssue, SchemaLike } from "./schemas.js";

export interface ConfigDefinition<TEnvSchema = undefined> {
  readonly env?: TEnvSchema | undefined;
}

export interface DefineConfigOptions<TEnvSchema> {
  env?: TEnvSchema | undefined;
}

export interface ResolvedConfig<TEnv> {
  env: TEnv;
}

export type InferResolvedConfig<TDefinition> = TDefinition extends ConfigDefinition<infer TEnvSchema>
  ? ResolvedConfig<InferSchemaOutput<TEnvSchema, Record<string, never>>>
  : never;

export class ConfigValidationError extends Error {
  readonly issues: ReadonlyArray<SchemaIssue>;

  constructor(issues: ReadonlyArray<SchemaIssue>) {
    super(formatConfigValidationError(issues));
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

export function defineConfig<TEnvSchema>(options: DefineConfigOptions<TEnvSchema>): ConfigDefinition<TEnvSchema> {
  return {
    env: options.env,
  };
}

export function resolveConfig<TDefinition extends ConfigDefinition<any>>(
  definition: TDefinition,
  env: Record<string, string | undefined> = process.env,
): InferResolvedConfig<TDefinition> {
  const resolvedEnv = resolveEnv(definition.env, env);

  return {
    env: resolvedEnv,
  } as InferResolvedConfig<TDefinition>;
}

function resolveEnv<TEnvSchema>(
  schema: TEnvSchema | undefined,
  env: Record<string, string | undefined>,
): InferSchemaOutput<TEnvSchema, Record<string, never>> {
  if (schema === undefined) {
    return {} as InferSchemaOutput<TEnvSchema, Record<string, never>>;
  }

  if (!isSchemaLike(schema)) {
    return {} as InferSchemaOutput<TEnvSchema, Record<string, never>>;
  }

  const result = schema.safeParse(env);

  if (result.success) {
    return result.data;
  }

  throw new ConfigValidationError(
    result.error.issues.map((issue) => ({
      path: ["env", ...issue.path],
      message: issue.message,
    })),
  );
}

function isSchemaLike(value: unknown): value is SchemaLike<any> {
  return typeof value === "object" && value !== null && "safeParse" in value;
}

function formatConfigValidationError(issues: ReadonlyArray<SchemaIssue>): string {
  const formattedIssues = issues
    .map((issue) => `- ${issue.path.map((segment) => String(segment)).join(".")}: ${issue.message}`)
    .join("\n");

  return `Action.js config error\n\n${formattedIssues}`;
}
