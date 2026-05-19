import type { TestResponse } from "./types.js";

export async function toTestResponse(response: Response): Promise<TestResponse> {
  const rawText = await response.text();

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    body: parseBody(rawText, response.headers.get("content-type")),
    rawText,
  };
}

function parseBody(rawText: string, contentType: string | null): unknown {
  if (rawText === "") {
    return undefined;
  }

  if (contentType?.toLowerCase().includes("application/json")) {
    return JSON.parse(rawText);
  }

  return rawText;
}
