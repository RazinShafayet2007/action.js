import { type InferSchemaOutput, formatSchemaIssues, isSchemaLike } from "./schemas.js";

export interface ActionErrorDefinition<
  TCode extends string = string,
  TStatus extends number = number,
  TDetailsSchema = undefined,
  TMetadataSchema = undefined,
> {
  readonly kind: "action-error-definition";
  readonly code: TCode;
  readonly status: TStatus;
  readonly message: string;
  readonly details?: TDetailsSchema | undefined;
  readonly metadata?: TMetadataSchema | undefined;
}

export interface DefineErrorOptions<TStatus extends number, TDetailsSchema, TMetadataSchema> {
  status: TStatus;
  message: string;
  details?: TDetailsSchema | undefined;
  metadata?: TMetadataSchema | undefined;
}

export type InferActionErrorDetails<TDefinition> = TDefinition extends ActionErrorDefinition<
  string,
  number,
  infer TDetailsSchema,
  any
>
  ? InferSchemaOutput<TDetailsSchema, never>
  : never;

export type InferActionErrorMetadata<TDefinition> = TDefinition extends ActionErrorDefinition<
  string,
  number,
  any,
  infer TMetadataSchema
>
  ? InferSchemaOutput<TMetadataSchema, never>
  : never;

export interface ActionErrorOptions<TDefinition extends ActionErrorDefinition = ActionErrorDefinition> {
  message?: string | undefined;
  details?: InferActionErrorDetails<TDefinition> | undefined;
  metadata?: InferActionErrorMetadata<TDefinition> | undefined;
  headers?: HeadersInit | undefined;
}

export type ErrorResponseBody<TCode extends string = string, TDetails = unknown, TMetadata = unknown> = {
  error: {
    code: TCode;
    message: string;
    details?: TDetails | undefined;
    metadata?: TMetadata | undefined;
    requestId?: string | undefined;
  };
};

export class ActionError<TDefinition extends ActionErrorDefinition = ActionErrorDefinition> extends Error {
  readonly kind = "action-error";
  override readonly name = "ActionError";
  readonly definition: TDefinition;
  readonly code: TDefinition["code"];
  readonly status: TDefinition["status"];
  readonly details: InferActionErrorDetails<TDefinition> | undefined;
  readonly metadata: InferActionErrorMetadata<TDefinition> | undefined;
  readonly headers: HeadersInit | undefined;

  constructor(definition: TDefinition, options: ActionErrorOptions<TDefinition> = {}) {
    super(options.message ?? definition.message);

    this.definition = definition;
    this.code = definition.code;
    this.status = definition.status;
    this.details = parseActionErrorValue("details", definition.details, options.details) as
      | InferActionErrorDetails<TDefinition>
      | undefined;
    this.metadata = parseActionErrorValue("metadata", definition.metadata, options.metadata) as
      | InferActionErrorMetadata<TDefinition>
      | undefined;
    this.headers = options.headers;
  }
}

export function defineError<
  TCode extends string,
  TStatus extends number,
  TDetailsSchema = undefined,
  TMetadataSchema = undefined,
>(
  code: TCode,
  options: DefineErrorOptions<TStatus, TDetailsSchema, TMetadataSchema>,
): ActionErrorDefinition<TCode, TStatus, TDetailsSchema, TMetadataSchema> {
  return {
    kind: "action-error-definition",
    code,
    status: options.status,
    message: options.message,
    details: options.details,
    metadata: options.metadata,
  };
}

export function actionError<TDefinition extends ActionErrorDefinition>(
  definition: TDefinition,
  options: ActionErrorOptions<TDefinition> = {},
): ActionError<TDefinition> {
  return new ActionError(definition, options);
}

export function isActionError(value: unknown): value is ActionError<ActionErrorDefinition> {
  return value instanceof ActionError;
}

export function isActionErrorDefinition(value: unknown): value is ActionErrorDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind?: unknown }).kind === "action-error-definition"
  );
}

function parseActionErrorValue<TSchema>(
  label: string,
  schema: TSchema | undefined,
  input: InferSchemaOutput<TSchema, never> | undefined,
): InferSchemaOutput<TSchema, never> | undefined {
  if (schema === undefined || input === undefined) {
    return input;
  }

  if (!isSchemaLike(schema)) {
    return input;
  }

  const result = schema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  throw new Error(`Invalid action error ${label}: ${formatSchemaIssues(result.error.issues)}`);
}
