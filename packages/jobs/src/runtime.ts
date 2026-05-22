import type { EnqueuedJob, JobDefinition } from "./types.js";
import { JobValidationError, isSchemaLike } from "./types.js";

export interface InMemoryJobQueueOptions<TServices> {
  services: TServices;
  generateId?: (() => string) | undefined;
}

export interface InMemoryJobQueue<TServices> {
  enqueue: <TJob extends JobDefinition<any, TServices, any>>(definition: TJob, input: unknown) => Promise<EnqueuedJob<TJob>>;
  runNext: () => Promise<EnqueuedJob<JobDefinition<string, TServices, any>> | null>;
  drain: () => Promise<void>;
  size: () => number;
}

export function createInMemoryJobQueue<TServices>(options: InMemoryJobQueueOptions<TServices>): InMemoryJobQueue<TServices> {
  const entries: Array<EnqueuedJob<JobDefinition<string, TServices, any>>> = [];
  const generateId = options.generateId ?? (() => crypto.randomUUID());

  return {
    async enqueue(definition, input) {
      const parsedInput = parseJobInput(definition, input);
      const enqueuedJob: EnqueuedJob<typeof definition> = {
        id: generateId(),
        definition,
        input: parsedInput as EnqueuedJob<typeof definition>["input"],
        attempts: 0,
      };

      entries.push(enqueuedJob as EnqueuedJob<JobDefinition<string, TServices, any>>);

      return enqueuedJob;
    },

    async runNext() {
      const next = entries.shift();

      if (!next) {
        return null;
      }

      await executeJob(options.services, next, entries);
      return next;
    },

    async drain() {
      while (entries.length > 0) {
        await this.runNext();
      }
    },

    size() {
      return entries.length;
    },
  };
}

function parseJobInput<TJob extends JobDefinition<any, any, any>>(definition: TJob, input: unknown): TJob extends JobDefinition<any, any, infer TInputSchema>
  ? import("@action-js/core").InferSchemaOutput<TInputSchema, unknown>
  : never {
  if (!definition.input || !isSchemaLike(definition.input)) {
    return input as never;
  }

  const result = definition.input.safeParse(input);

  if (result.success) {
    return result.data as never;
  }

  throw new JobValidationError(definition.name, result.error.issues);
}

async function executeJob<TServices>(
  services: TServices,
  enqueuedJob: EnqueuedJob<JobDefinition<string, TServices, any>>,
  entries: Array<EnqueuedJob<JobDefinition<string, TServices, any>>>,
): Promise<void> {
  const maxAttempts = enqueuedJob.definition.retry?.attempts ?? 1;

  try {
    enqueuedJob.attempts += 1;
    await enqueuedJob.definition.handler({
      services,
      input: enqueuedJob.input,
    });
  } catch (error) {
    if (enqueuedJob.attempts < maxAttempts) {
      entries.push(enqueuedJob);
      return;
    }

    throw error;
  }
}
