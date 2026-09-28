import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode, StatusCode } from 'hono/utils/http-status';
import { flagParam, intParam, pick } from './query.ts';

export const MAX_DELAY_MS = 10_000;

const REASONS: Record<number, string> = {
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
function shouldFail(value: string | undefined, random: () => number): boolean {
  if (value === undefined) return false;
  const rate = Number(value);
  if (Number.isFinite(rate) && rate > 0 && rate < 1) return random() < rate;
  return flagParam(value, false);
}

function parseStatus(value: string | undefined): number | null {
  const status = Number(value);
  return Number.isInteger(status) && status >= 200 && status <= 599 ? status : null;
}

/**
 * Lets clients rehearse slow and failing backends without changing their code:
 *   ?delay=1500    wait before responding (up to 10 s)
 *   ?status=503    respond with that status; 4xx and 5xx return a simulated error body
 *   ?fail=true     fail with a 500 (or `status`); `fail=0.2` fails 20% of requests
 * Out-of-range values are ignored. Simulated responses carry `X-Simulated: true`.
 */
export const simulate = (random: () => number = Math.random) =>
  createMiddleware(async (c, next) => {
    const query = c.req.query();
    const delay = intParam(pick(query, 'delay'), 0, MAX_DELAY_MS);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    const status = parseStatus(pick(query, 'status'));
    const failing = shouldFail(pick(query, 'fail'), random) || (status !== null && status >= 400);
    if (failing) {
      const code = status !== null && status >= 400 ? status : 500;
      c.header('X-Simulated', 'true');
      if (code === 429 || code === 503) c.header('Retry-After', '1');
      return c.json(
        { error: REASONS[code] ?? 'Simulated error', status: code, simulated: true },
        code as ContentfulStatusCode,
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
  });
