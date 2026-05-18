import type { ActionApp } from "@action-js/node";

export interface TestResponse<TBody = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  body: TBody;
  rawText: string;
}

export interface TestAppOptions {
  baseUrl?: string | undefined;
}

export interface TestRequestBuilder<TBody = unknown> extends PromiseLike<TestResponse<TBody>> {
  headers(headers: HeadersInit): TestRequestBuilder<TBody>;
  query(query: Record<string, unknown>): TestRequestBuilder<TBody>;
  body(body: unknown): TestRequestBuilder<TBody>;
  text(body: string, contentType?: string): TestRequestBuilder<TBody>;
  send(): Promise<TestResponse<TBody>>;
}

export interface TestApp<TServices = Record<string, never>, TContext extends object = {}> {
  readonly app: ActionApp<TServices, TContext>;
  request(path: string, method?: string): TestRequestBuilder;
  get(path: string): TestRequestBuilder;
  post(path: string): TestRequestBuilder;
  put(path: string): TestRequestBuilder;
  patch(path: string): TestRequestBuilder;
  delete(path: string): TestRequestBuilder;
}
