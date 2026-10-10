/**
 * Live streams: Server-Sent Events that play a seeded dataset one record at a time, for building and testing the screens
 * that listen: a chat, a notification bell, a metrics chart, a log tail.
 *
 * `GET /streams/{name}` plays `/{name}` (messages, notifications, metrics or logs) from its first record: event `id` is the
 * record's own `id`, `data` is the record as JSON, and the first N events of a stream are the first N records of the
 * dataset for the same `seed` and `locale`. Nothing is random and nothing reads the clock, so a stream replays exactly.
 *
 * It is bounded in what it holds, because an open stream is a held connection: at most `LIMITS.count.max` events in all,
 * at most `LIMITS.duration.max` seconds for one connection, an event at most every `LIMITS.every.min` ms, and one timer
 * per open stream (no loop, nothing runs between events). `Last-Event-ID` resumes where a dropped connection stopped, as
 * `EventSource` sends it by itself; once the last event has gone, a reconnect is answered `204`, which tells `EventSource`
 * to stop. A stream that must fail or drop on purpose can (`status`, `fail`, `drop`), to rehearse a client's reconnecting.
 */
import { OpenAPIHono, z } from '@hono/zod-openapi';
import { chooseDelay, MAX_DELAY_MS, parseStatus, REASONS, requestKey, shouldFail } from '../lib/controls.ts';
import { parseLocale } from '../lib/locale.ts';
import { intParam, pick } from '../lib/query.ts';
import { publicBase, safeRecord, wantsSafe } from '../lib/safe.ts';
import { DEFAULT_SEED, MAX_SEED, resources } from '../resources.ts';

export const LIMITS = {
  /** Events in a whole stream: the default, and the most a request may ask for. */
  count: { default: 20, max: 500 },
  /** Milliseconds between two events. */
  every: { default: 1000, min: 100, max: 10_000 },
  /** Seconds one connection stays open; a client that reconnects carries on from where it was. */
  duration: { default: 30, max: 60 },
  /** What the client is told to wait before it reconnects, in milliseconds. */
  retry: 3000,
} as const;

export interface StreamInfo {
  name: string;
  path: string;
  description: string;
  /** Where the events come from: the dataset whose records they are. */
  dataset: string;
}

/** The datasets a stream can play, with what each is for. */
export const STREAMS: Readonly<Record<string, { dataset: string; description: string }>> = {
  messages: {
    dataset: 'messages',
    description: 'An inbox arriving: a chat or mail feed. Replies come after the message they answer.',
  },
  notifications: {
    dataset: 'notifications',
    description: 'App notifications arriving for users 1 to 1,000: a bell, a badge count, a toast.',
  },
  metrics: {
    dataset: 'metrics',
    description: 'Server metrics ticking in: CPU, memory, traffic, latency and errors, with an incident now and then.',
  },
  logs: {
    dataset: 'logs',
    description: 'Log lines arriving: a tail, with levels, services and the odd error.',
  },
};

export const STREAM_NAMES = Object.keys(STREAMS) as [string, ...string[]];

const encoder = new TextEncoder();

/** One SSE event: `id`, `data` on one line, and a blank line to end it. */
export const sseEvent = (id: number, data: unknown, event?: string): string =>
  `id: ${id}\n${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`;

/** The id a client was last given: `Last-Event-ID` as `EventSource` sends it, or `lastEventId` in the query. */
export function lastEventId(header: string | undefined, query: string | undefined): number {
  const raw = (header ?? query ?? '').trim();
  return /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function streamRoutes({ safe = true }: { safe?: boolean } = {}): OpenAPIHono {
  const app = new OpenAPIHono();

  app.get('/', (c) => {
    const base = new URL(c.req.url).pathname.replace(/\/+$/, '');
    const list: StreamInfo[] = Object.entries(STREAMS).map(([name, stream]) => ({
      name,
      path: `${base}/${name}`,
      description: stream.description,
      dataset: stream.dataset,
    }));
    return c.json(list);
  });

  app.get('/:name', async (c) => {
    const name = c.req.param('name');
    const stream = Object.hasOwn(STREAMS, name) ? STREAMS[name] : undefined;
    const resource = stream ? resources.find((candidate) => candidate.name === stream.dataset) : undefined;
    if (!stream || !resource) {
      return c.json({ error: `No stream named "${name}". The streams are ${STREAM_NAMES.join(', ')}.` }, 404);
    }
    const query = c.req.query();
    const seed = intParam(pick(query, 'seed'), DEFAULT_SEED, MAX_SEED);
    const locale = parseLocale(pick(query, 'locale'));
    const asked = clamp(intParam(pick(query, 'count'), LIMITS.count.default, LIMITS.count.max), 1, LIMITS.count.max);
    const every = clamp(
      intParam(pick(query, 'every'), LIMITS.every.default, LIMITS.every.max),
      LIMITS.every.min,
      LIMITS.every.max,
    );
    const seconds = clamp(
      intParam(pick(query, 'duration'), LIMITS.duration.default, LIMITS.duration.max),
      1,
      LIMITS.duration.max,
    );
    const dropAfter = intParam(pick(query, 'drop'), 0, LIMITS.count.max);

    // The simulation controls that make sense for a stream: a refusal before it opens, and a wait before its first event.
    const status = parseStatus(pick(query, 'status'));
    if (shouldFail(pick(query, 'fail'), Math.random) || (status !== null && status >= 400)) {
      const code = status !== null && status >= 400 ? status : 500;
      c.header('X-Simulated', 'true');
      if (code === 429 || code === 503) c.header('Retry-After', '1');
      return c.json({ error: REASONS[code] ?? 'Simulated error', status: code, simulated: true }, code as 500);
    }
    const wait = chooseDelay(pick(query, 'delay'), requestKey(c.req.url, c.req.path));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(wait, MAX_DELAY_MS)));

    // Where to start: after the last id the client saw. Past the end, 204 tells `EventSource` not to reconnect.
    const { records } = resource.load(seed, locale);
    // A dataset is never shorter than the longest stream, but the stream never promises more than the data holds.
    const count = Math.min(asked, records.length);
    const first = lastEventId(c.req.header('last-event-id'), pick(query, 'lastEventId')) + 1;
    if (first > count) return c.body(null, 204);

    const sendSafe = wantsSafe(query, safe);
    const base = publicBase(c.req.url, c.req.header('x-forwarded-prefix'));
    const present = (record: object) => (sendSafe ? safeRecord(stream.dataset, record, { base }) : record);

    let next = first;
    let sent = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const began = performance.now();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `retry: ${LIMITS.retry}\n: ${name} stream, seed ${seed}, ${count} events, one every ${every} ms, from id ${first}\n\n`,
          ),
        );
      },
      pull(controller) {
        return new Promise<void>((resolve) => {
          const emit = () => {
            timer = undefined;
            if (sent > 0 && dropAfter > 0 && sent >= dropAfter) {
              // Dropped on purpose: no end event, so the client reconnects, as it would after a real drop.
              controller.close();
              return resolve();
            }
            if (performance.now() - began + every > seconds * 1000 && sent > 0) {
              controller.enqueue(
                encoder.encode(`: closing after ${seconds} s; reconnect to carry on from id ${next}\n\n`),
              );
              controller.close();
              return resolve();
            }
            const record = records[next - 1] as object;
            controller.enqueue(encoder.encode(sseEvent(next, present(record))));
            sent += 1;
            next += 1;
            if (next > count) {
              controller.enqueue(encoder.encode(sseEvent(count, { reason: 'complete', count }, 'end')));
              controller.close();
            }
            resolve();
          };
          if (sent === 0) emit();
          else timer = setTimeout(emit, every);
        });
      },
      cancel() {
        if (timer) clearTimeout(timer);
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'X-Stream-Events': `${first}-${count}`,
      },
    });
  });

  return app;
}

/** The documentation of the stream routes, written to the OpenAPI registry because the handler streams, not validates. */
export function documentStreams(app: OpenAPIHono): void {
  const query = z.object({
    seed: z
      .string()
      .optional()
      .openapi({ description: 'Seed of the dataset played. The same seed plays the same events.' }),
    locale: z.string().optional().openapi({ description: 'Data locale of the records (messages and notifications).' }),
    count: z
      .string()
      .optional()
      .openapi({
        description: `Events in the whole stream, 1 to ${LIMITS.count.max} (default ${LIMITS.count.default}). After the last one the stream sends an \`end\` event and closes.`,
      }),
    every: z
      .string()
      .optional()
      .openapi({
        description: `Milliseconds between events, ${LIMITS.every.min} to ${LIMITS.every.max} (default ${LIMITS.every.default}).`,
      }),
    duration: z
      .string()
      .optional()
      .openapi({
        description: `Seconds one connection stays open, 1 to ${LIMITS.duration.max} (default ${LIMITS.duration.default}). A client that reconnects carries on from its last id.`,
      }),
    drop: z.string().optional().openapi({
      description:
        'Close the connection without an `end` event after this many events, to rehearse a client that reconnects.',
    }),
    lastEventId: z.string().optional().openapi({
      description: 'Start after this event id, for a client that cannot send the `Last-Event-ID` header.',
    }),
    delay: z.string().optional().openapi({ description: 'Wait this many milliseconds before the first event.' }),
    status: z.string().optional().openapi({ description: 'Refuse with this 4xx or 5xx status instead of streaming.' }),
    fail: z
      .string()
      .optional()
      .openapi({ description: '`true` refuses with a 500; a number from 0 to 1 refuses that share of connections.' }),
    safe: z.string().optional().openapi({ description: 'Safe values: example-domain emails (messages).' }),
  });
  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/streams',
    tags: ['Streams'],
    operationId: 'list_streams',
    summary: 'List the live streams',
    responses: { 200: { description: 'The streams, each with its path and the dataset whose records it plays.' } },
  });
  app.openAPIRegistry.registerPath({
    method: 'get',
    path: '/streams/{name}',
    tags: ['Streams'],
    operationId: 'stream',
    summary: 'Play a dataset as Server-Sent Events',
    description:
      "Plays `messages`, `notifications`, `metrics` or `logs` one record at a time as `text/event-stream`. Each event has the record's `id` and the record as JSON `data`, so `EventSource.onmessage` receives it; the first N events are the first N records of the dataset for the same `seed` and `locale`. The stream ends with an `end` event, and a reconnect after it is answered `204` so `EventSource` stops. `Last-Event-ID` resumes after a dropped connection. Bounded: at most 500 events, 60 seconds a connection and an event every 100 ms.",
    request: { params: z.object({ name: z.enum(STREAM_NAMES) }), query },
    responses: {
      200: { description: 'An event stream.', content: { 'text/event-stream': { schema: z.string() } } },
      204: { description: 'Every event up to `count` has already been sent (the `Last-Event-ID` was the last).' },
      400: { description: 'An unsupported locale.' },
      404: { description: 'No such stream.' },
    },
  });
}
