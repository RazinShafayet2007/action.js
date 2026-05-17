export interface SchemaIssue {
  path: ReadonlyArray<string | number>;
  message: string;
}

export interface SchemaParseSuccess<TOutput> {
  success: true;
  data: TOutput;
}

export interface SchemaParseFailure {
  success: false;
  error: {
    issues: ReadonlyArray<SchemaIssue>;
  };
}

export type SchemaParseResult<TOutput> = SchemaParseSuccess<TOutput> | SchemaParseFailure;

export interface SchemaLike<TOutput = unknown> {
  safeParse(input: unknown): SchemaParseResult<TOutput>;
}

export type InferSchemaOutput<TSchema, TDefault> = TSchema extends SchemaLike<infer TOutput>
  ? TOutput
  : TDefault;

export type QueryValue = string | string[];

export type RawQuery = Record<string, QueryValue>;

export function isSchemaLike(value: unknown): value is SchemaLike<any> {
  return typeof value === "object" && value !== null && "safeParse" in value;
}

export function formatSchemaIssues(issues: ReadonlyArray<SchemaIssue>): string {
  return issues
    .map((issue) => {
      const path = issue.path.length === 0 ? "(root)" : issue.path.map((segment) => String(segment)).join(".");
      return `${path} ${issue.message}`;
    })
    .join("; ");
}
