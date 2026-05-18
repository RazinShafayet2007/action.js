export interface ActionClientErrorOptions<TCode extends string, TDetails, TMetadata> {
  code: TCode;
  status: number;
  message: string;
  details?: TDetails | undefined;
  metadata?: TMetadata | undefined;
  requestId?: string | undefined;
  response: Response;
}

export class ActionClientError<TCode extends string = string, TDetails = unknown, TMetadata = unknown> extends Error {
  readonly code: TCode;
  readonly status: number;
  readonly details: TDetails | undefined;
  readonly metadata: TMetadata | undefined;
  readonly requestId: string | undefined;
  readonly response: Response;

  constructor(options: ActionClientErrorOptions<TCode, TDetails, TMetadata>) {
    super(options.message);

    this.name = "ActionClientError";
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.metadata = options.metadata;
    this.requestId = options.requestId;
    this.response = options.response;
  }
}

export function isActionClientError(value: unknown): value is ActionClientError {
  return value instanceof ActionClientError;
}
