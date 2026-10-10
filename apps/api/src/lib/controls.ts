import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';
import { flagParam, intParam, pick } from './query.ts';

/** The longest any request may take: `delay` and a trickled body together never exceed it. */
export const MAX_DELAY_MS = 10_000;

/** A trickled body is cut into pieces of about this many bytes, fewer and larger when the ceiling needs it. */
export const TRICKLE_CHUNK_BYTES = 256;

export const REASONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  408: 'Request Timeout',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/** `fail=true` always fails; a number between 0 and 1 fails that fraction of requests. */
export function shouldFail(value: string | undefined, random: () => number): boolean {
  if (value === undefined) return false;
  const rate = Number(value);
  if (Number.isFinite(rate) && rate > 0 && rate < 1) return random() < rate;
  return flagParam(value, false);
}

/** FNV-1a with a final mix, so nearby URLs land far apart. The same text gives the same number everywhere. */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/**
 * `delay=1500` waits that long; `delay=200-800` picks a wait inside the range from `key` (the request,
 * seed included), so the same URL waits the same time on every machine. Values clamp to the ceiling.
 */
export function chooseDelay(value: string | undefined, key: string): number {
  const match = value?.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) return 0;
  const first = Math.min(Number(match[1]), MAX_DELAY_MS);
  const second = match[2] === undefined ? first : Math.min(Number(match[2]), MAX_DELAY_MS);
  const [low, high] = first <= second ? [first, second] : [second, first];
  return low === high ? low : low + (hashText(key) % (high - low + 1));
}

/** The request as a stable string: path plus sorted query, so parameter order does not change the wait. */
export function requestKey(url: string, path: string): string {
  const params = new URL(url).searchParams;
  params.sort();
  return `${path}?${params.toString()}`;
}

/**
 * Sends `res` with its headers at once and its body in pieces `gap` ms apart, taking no longer than
 * `budget` ms in all. A body too small to split, or no time to split it in, is sent unchanged.
 */
export async function trickle(res: Response, gap: number, budget: number): Promise<Response> {
  if (res.body === null || gap <= 0) return res;
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pieces = Math.min(Math.ceil(bytes.length / TRICKLE_CHUNK_BYTES), Math.floor(budget / gap) + 1);
  const init = { status: res.status, statusText: res.statusText, headers: res.headers };
  if (pieces <= 1) return new Response(bytes, init);

  const size = Math.ceil(bytes.length / pieces);
  let offset = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const nextPiece = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    controller.enqueue(bytes.subarray(offset, offset + size));
    offset += size;
    if (offset >= bytes.length) controller.close();
  };
  const body = new ReadableStream<Uint8Array>({
    start: nextPiece,
    pull: (controller) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          nextPiece(controller);
          resolve();
        }, gap);
      }),
    cancel: () => clearTimeout(timer),
  });
  return new Response(body, init);
}

export function parseStatus(value: string | undefined): number | null {
  const status = Number(value);
  return Number.isInteger(status) && status >= 200 && status <= 599 ? status : null;
}

/**
 * Lets clients rehearse slow and failing backends without changing their code:
 *   ?delay=1500    wait before responding (up to 10 s); `delay=200-800` picks a repeatable wait in the range
 *   ?trickle=200   send the headers at once and the body in pieces 200 ms apart
 *   ?status=503    respond with that status; 4xx and 5xx return a simulated error body
 *   ?fail=true     fail with a 500 (or `status`); `fail=0.2` fails 20% of requests
 * Out-of-range values are ignored. `delay` and the trickle together stay within 10 s.
 * Simulated responses carry `X-Simulated: true`.
 */
export const simulate = (random: () => number = Math.random) =>
  createMiddleware(async (c, next) => {
    const query = c.req.query();
    const delay = chooseDelay(pick(query, 'delay'), requestKey(c.req.url, c.req.path));
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const gap = intParam(pick(query, 'trickle'), 0, MAX_DELAY_MS);
    const slowly = (res: Response) => trickle(res, gap, MAX_DELAY_MS - delay);

    const status = parseStatus(pick(query, 'status'));
    const failing = shouldFail(pick(query, 'fail'), random) || (status !== null && status >= 400);
    if (failing) {
      const code = status !== null && status >= 400 ? status : 500;
      c.header('X-Simulated', 'true');
      if (code === 429 || code === 503) c.header('Retry-After', '1');
      return slowly(
        c.json(
          { error: REASONS[code] ?? 'Simulated error', status: code, simulated: true },
          code as ContentfulStatusCode,
        ),
      );
    }

    await next();

    if (status !== null && c.res.status < 400) {
      const headers = new Headers(c.res.headers);
      headers.set('X-Simulated', 'true');
      const bodyless = status === 204 || status === 205 || status === 304;
      if (bodyless) {
        headers.delete('content-length');
        headers.delete('content-type');
      }
      c.res = new Response(bodyless ? null : c.res.body, { status: status as StatusCode, headers });
    }
    if (gap > 0) c.res = await slowly(c.res);
  });
