import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";

import { getAppLifecycleHooks, getAppServices, runStartHooks, runStopHooks, type ActionApp } from "./app.js";
import { createDefaultLogger, type ActionLogger, type RequestLogEntry } from "./logger.js";

export interface ServeOptions {
  host?: string | undefined;
  port?: number | undefined;
  logger?: ActionLogger | false | undefined;
  shutdownSignals?: NodeJS.Signals[] | undefined;
}

export interface ActionServer {
  readonly server: Server;
  readonly ready: Promise<{ host: string; port: number; url: string }>;
  readonly url: string;
  close: () => Promise<void>;
}

export function serve<TServices, TContext extends object>(
  app: ActionApp<TServices, TContext>,
  options: ServeOptions = {},
): ActionServer {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3000;
  const hooks = getAppLifecycleHooks(app);
  const services = getAppServices(app);
  const logger = options.logger === undefined ? createDefaultLogger() : options.logger;
  const shutdownSignals = options.shutdownSignals ?? ["SIGINT", "SIGTERM"];
  let resolvedUrl = `http://${displayHost(host)}:${port}`;
  let isClosing = false;
  let isClosed = false;

  const server = createServer(async (request, response) => {
    const startedAt = Date.now();
    const actionRequest = toRequest(request, resolvedUrl);
    const actionResponse = await app.fetch(actionRequest);

    await writeResponse(response, actionResponse);
    await logRequest(logger, {
      level: actionResponse.status >= 500 ? "error" : "info",
      requestId: actionResponse.headers.get("x-request-id") ?? undefined,
      method: actionRequest.method,
      path: new URL(actionRequest.url).pathname,
      status: actionResponse.status,
      durationMs: Date.now() - startedAt,
    });
  });

  const ready = (async () => {
    await runStartHooks(hooks, services);

    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.once("error", rejectPromise);
      server.listen(port, host, () => {
        server.off("error", rejectPromise);
        resolvePromise();
      });
    });

    const address = server.address();

    if (typeof address === "object" && address !== null) {
      resolvedUrl = `http://${displayHost(address.address)}:${address.port}`;

      return {
        host: address.address,
        port: address.port,
        url: resolvedUrl,
      };
    }

    return {
      host,
      port,
      url: resolvedUrl,
    };
  })();

  const signalHandlers = new Map<NodeJS.Signals, () => void>();

  const close = async (): Promise<void> => {
    if (isClosed || isClosing) {
      return;
    }

    isClosing = true;
    removeSignalHandlers();

    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }

        resolvePromise();
      });
    });

    await runStopHooks(hooks, services);
    isClosed = true;
    isClosing = false;
  };

  for (const signal of shutdownSignals) {
    const handler = () => {
      void close();
    };

    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }

  function removeSignalHandlers(): void {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler);
    }
  }

  return {
    server,
    get url() {
      return resolvedUrl;
    },
    ready,
    close,
  };
}

function toRequest(request: IncomingMessage, baseUrl: string): Request {
  const url = new URL(request.url ?? "/", baseUrl);
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }

      continue;
    }

    headers.set(key, value);
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method ?? "GET",
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = Readable.toWeb(request) as unknown as BodyInit;
    init.duplex = "half";
  }

  return new Request(url, init);
}

async function writeResponse(response: ServerResponse, actionResponse: Response): Promise<void> {
  response.statusCode = actionResponse.status;

  for (const [key, value] of actionResponse.headers.entries()) {
    response.setHeader(key, value);
  }

  if (actionResponse.body === null) {
    response.end();
    return;
  }

  const body = Buffer.from(await actionResponse.arrayBuffer());
  response.end(body);
}

async function logRequest(logger: ActionLogger | false, entry: RequestLogEntry): Promise<void> {
  if (!logger) {
    return;
  }

  if (entry.level === "error") {
    await logger.error(entry);
    return;
  }

  await logger.info(entry);
}

function displayHost(host: string): string {
  return host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}
