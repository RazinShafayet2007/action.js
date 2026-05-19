import { describe, expect, it } from "vitest";

import { action } from "@action-js/core";

import { createActionApp } from "./app.js";
import { requestId } from "./middleware.js";
import { serve, type RequestLogEntry } from "./serve.js";

describe("serve", () => {
  it("runs startup and shutdown hooks and serves HTTP requests", async () => {
    const events: string[] = [];

    const app = createActionApp({
      services: {
        name: "node-runtime",
      },
    })
      .onStart(({ services }) => {
        events.push(`start:${services.name}`);
      })
      .onRequest(({ request }) => {
        events.push(`request:${new URL(request.url).pathname}`);
      })
      .onResponse(({ response }) => {
        events.push(`response:${response.status}`);
      })
      .onStop(({ services }) => {
        events.push(`stop:${services.name}`);
      })
      .action(
        action({
          method: "GET",
          path: "/health",
          handler: () => ({
            status: 200 as const,
            body: { ok: true },
          }),
        }),
      );

    const server = serve(app, {
      port: 0,
      logger: false,
      shutdownSignals: [],
    });

    const ready = await server.ready;
    const response = await fetch(`${ready.url}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    await server.close();

    expect(events).toEqual(["start:node-runtime", "request:/health", "response:200", "stop:node-runtime"]);
  });

  it("logs requestId, path, status, and duration through the configured logger", async () => {
    const logs: RequestLogEntry[] = [];

    const app = createActionApp()
      .use(requestId({ generator: () => "req_runtime" }))
      .action(
        action({
          method: "GET",
          path: "/boom",
          handler: () => {
            throw new Error("boom");
          },
        }),
      );

    const server = serve(app, {
      port: 0,
      shutdownSignals: [],
      logger: {
        info(entry) {
          logs.push(entry);
        },
        error(entry) {
          logs.push(entry);
        },
      },
    });

    const ready = await server.ready;
    const response = await fetch(`${ready.url}/boom`);

    expect(response.status).toBe(500);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      level: "error",
      requestId: "req_runtime",
      method: "GET",
      path: "/boom",
      status: 500,
    });
    expect(typeof logs[0]?.durationMs).toBe("number");

    await server.close();
  });
});
