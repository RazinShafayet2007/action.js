import type {
  ActionDefinition,
  ActionErrorDefinition,
  ActionResponseDefinitions,
  InferActionErrorDetails,
  InferActionErrorMetadata,
  InferSchemaOutput,
  PathParams,
  RawQuery,
  SchemaLike,
} from "@action-js/core";

export type AnyAction = ActionDefinition<any, string, any, any, any, any, any, ActionResponseDefinitions | undefined, any>;

export type ClientActionTree = {
  [key: string]: AnyAction | ClientActionTree;
};

type Simplify<T> = {
  [TKey in keyof T]: T[TKey];
} & {};

type ActionPath<TAction> = TAction extends ActionDefinition<any, infer TPath, any, any, any, any, any, any, any>
  ? TPath
  : never;

type ActionParamsSchema<TAction> = TAction extends ActionDefinition<any, any, any, any, infer TParamsSchema, any, any, any, any>
  ? TParamsSchema
  : never;

type ActionQuerySchema<TAction> = TAction extends ActionDefinition<any, any, any, any, any, infer TQuerySchema, any, any, any>
  ? TQuerySchema
  : never;

type ActionBodySchema<TAction> = TAction extends ActionDefinition<any, any, any, any, any, any, infer TBodySchema, any, any>
  ? TBodySchema
  : never;

export type ActionResponses<TAction> = TAction extends ActionDefinition<any, any, any, any, any, any, any, infer TResponses, any>
  ? TResponses
  : never;

type ActionParams<TAction> = InferSchemaOutput<ActionParamsSchema<TAction>, PathParams<ActionPath<TAction>>>;

type ActionQuery<TAction> = InferSchemaOutput<ActionQuerySchema<TAction>, RawQuery>;

type ActionBody<TAction> = InferSchemaOutput<ActionBodySchema<TAction>, unknown>;

type SuccessResponseBodies<TResponses extends ActionResponseDefinitions | undefined> = [TResponses] extends [undefined]
  ? unknown
  : {
      [TStatus in Extract<keyof NonNullable<TResponses>, number>]: NonNullable<TResponses>[TStatus] extends SchemaLike<any>
        ? InferSchemaOutput<NonNullable<TResponses>[TStatus], never>
        : never;
    }[Extract<keyof NonNullable<TResponses>, number>];

type ErrorResponseDefinitions<TResponses extends ActionResponseDefinitions | undefined> = [TResponses] extends [undefined]
  ? never
  : {
      [TStatus in Extract<keyof NonNullable<TResponses>, number>]: NonNullable<TResponses>[TStatus] extends ActionErrorDefinition
        ? NonNullable<TResponses>[TStatus]
        : never;
    }[Extract<keyof NonNullable<TResponses>, number>];

type RequestCoreInput<TAction> = Simplify<
  ([ActionParamsSchema<TAction>] extends [undefined]
    ? PathParams<ActionPath<TAction>> extends Record<string, never>
      ? {}
      : { params: ActionParams<TAction> }
    : { params: ActionParams<TAction> }) &
    ([ActionQuerySchema<TAction>] extends [undefined] ? {} : { query: ActionQuery<TAction> }) &
    ([ActionBodySchema<TAction>] extends [undefined] ? {} : { body: ActionBody<TAction> })
>;

type RequiredKeys<T> = {
  [TKey in keyof T]-?: {} extends Pick<T, TKey> ? never : TKey;
}[keyof T];

export type ClientRequestInput<TAction> = Simplify<
  RequestCoreInput<TAction> & {
    headers?: HeadersInit | undefined;
    signal?: AbortSignal | undefined;
  }
>;

export type ClientSuccess<TAction> = SuccessResponseBodies<ActionResponses<TAction>>;

export type ClientErrorDefinitions<TAction> = ErrorResponseDefinitions<ActionResponses<TAction>>;

export type ClientErrorCode<TAction> = ClientErrorDefinitions<TAction> extends ActionErrorDefinition<infer TCode, any, any, any>
  ? TCode
  : string;

export type ClientErrorDetails<TAction> = ClientErrorDefinitions<TAction> extends infer TDefinition
  ? TDefinition extends ActionErrorDefinition
    ? InferActionErrorDetails<TDefinition>
    : never
  : never;

export type ClientErrorMetadata<TAction> = ClientErrorDefinitions<TAction> extends infer TDefinition
  ? TDefinition extends ActionErrorDefinition
    ? InferActionErrorMetadata<TDefinition>
    : never
  : never;

export type ClientFunction<TAction> = RequiredKeys<RequestCoreInput<TAction>> extends never
  ? (input?: ClientRequestInput<TAction>) => Promise<ClientSuccess<TAction>>
  : (input: ClientRequestInput<TAction>) => Promise<ClientSuccess<TAction>>;

export type ClientFromTree<TTree> = {
  [TKey in keyof TTree]: TTree[TKey] extends AnyAction
    ? ClientFunction<TTree[TKey]>
    : TTree[TKey] extends ClientActionTree
      ? ClientFromTree<TTree[TKey]>
      : never;
};

export interface CreateClientOptions<TTree extends ClientActionTree> {
  baseUrl: string;
  actions: TTree;
  fetch?: typeof fetch | undefined;
  headers?: HeadersInit | undefined;
}
