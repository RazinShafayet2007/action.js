import { z } from "zod";
import { describe, expect, it } from "vitest";

import { createInMemoryJobQueue, job, JobValidationError } from "./index.js";

describe("jobs", () => {
  it("enqueues and executes typed jobs", async () => {
    const events: string[] = [];

    const sendWelcomeEmail = job({
      name: "sendWelcomeEmail",
      input: z.object({
        userId: z.string(),
      }),
      handler: async ({ input, services }: { input: { userId: string }; services: { prefix: string } }) => {
        events.push(`${services.prefix}:${input.userId}`);
      },
    });

    const queue = createInMemoryJobQueue({
      services: {
        prefix: "email",
      },
      generateId: () => "job_1",
    });

    const enqueued = await queue.enqueue(sendWelcomeEmail, { userId: "user_1" });

    expect(enqueued.id).toBe("job_1");
    expect(queue.size()).toBe(1);

    await queue.runNext();

    expect(queue.size()).toBe(0);
    expect(events).toEqual(["email:user_1"]);
  });

  it("validates job input against the declared schema", async () => {
    const sendWelcomeEmail = job({
      name: "sendWelcomeEmail",
      input: z.object({
        userId: z.string(),
      }),
      handler: async () => {},
    });

    const queue = createInMemoryJobQueue({
      services: {},
    });

    await expect(queue.enqueue(sendWelcomeEmail, { userId: 123 })).rejects.toBeInstanceOf(JobValidationError);
  });

  it("retries jobs until the configured attempt limit", async () => {
    let attempts = 0;

    const flakyJob = job({
      name: "flakyJob",
      retry: {
        attempts: 3,
      },
      handler: async () => {
        attempts += 1;

        if (attempts < 3) {
          throw new Error("temporary");
        }
      },
    });

    const queue = createInMemoryJobQueue({
      services: {},
    });

    await queue.enqueue(flakyJob, undefined);
    await queue.drain();

    expect(attempts).toBe(3);
    expect(queue.size()).toBe(0);
  });

  it("rethrows permanently failing jobs after the final retry", async () => {
    let attempts = 0;

    const failingJob = job({
      name: "failingJob",
      retry: {
        attempts: 2,
      },
      handler: async () => {
        attempts += 1;
        throw new Error("still failing");
      },
    });

    const queue = createInMemoryJobQueue({
      services: {},
    });

    await queue.enqueue(failingJob, undefined);

    await queue.runNext();

    await expect(queue.runNext()).rejects.toThrow("still failing");
    expect(attempts).toBe(2);
    expect(queue.size()).toBe(0);
  });
});
