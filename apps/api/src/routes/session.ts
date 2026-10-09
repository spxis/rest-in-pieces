import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { pick } from '../lib/query.ts';
import type { Session } from '../lib/session.ts';

const Limits = z
  .object({
    records: z.number().int().openapi({
      description:
        'Records one dataset of 1,000 may hold, at one seed and locale. A dataset seeded with more (orders, comments, todos) may hold proportionally more.',
    }),
    datasets: z
      .number()
      .int()
      .openapi({ description: 'Datasets, counting each seed and locale apart, that may hold changes at once.' }),
    bytes: z.number().int().openapi({ description: 'Bytes of written records, as JSON, across the session.' }),
  })
  .openapi('SessionLimits');

export const SessionState = z
  .object({
    enabled: z.boolean().openapi({
      description:
        'Whether writes are kept. Off by default; on with `--session`, `REST_IN_PIECES_SESSION=true` or `createApp({ session: true })`.',
    }),
    limits: Limits,
    usage: z.object({ datasets: z.number().int(), bytes: z.number().int() }),
    datasets: z
      .array(
        z.object({
          dataset: z.string().openapi({ example: 'users' }),
          seed: z.number().int(),
          locale: z.string(),
          records: z.number().int().openapi({ description: 'Records the dataset holds now.' }),
          created: z.number().int(),
          updated: z.number().int(),
          deleted: z.number().int(),
          lastWrite: z.string().datetime(),
        }),
      )
      .openapi({ description: 'Every dataset a write has changed, at its seed and locale.' }),
  })
  .openapi('Session');

const SESSION_DOCS =
  'With the session on, `POST`, `PUT`, `PATCH` and `DELETE` change an in-memory copy of the dataset at the ' +
  "request's `seed` and `locale`, and every later read sees the change, until `POST /reset`. The copy lives in " +
  "the process's memory only: nothing is written to disk, a restart starts again from the seed, and on " +
  'serverless hosts each instance keeps its own. It is off by default, and stays off on the hosted demo.';

const getRoute = createRoute({
  method: 'get',
  path: '/session',
  tags: ['Session'],
  operationId: 'getSession',
  summary: 'Show what the session holds',
  description: `Whether writes are kept, the limits, and every dataset a write has changed.\n\n${SESSION_DOCS}`,
  responses: { 200: { description: 'The session.', content: { 'application/json': { schema: SessionState } } } },
});

const resetRoute = createRoute({
  method: 'post',
  path: '/reset',
  tags: ['Session'],
  operationId: 'resetSession',
  summary: 'Put the seeded data back',
  description: `Drops every change the session holds, or one dataset's with \`?dataset=users\`, so reads return the seeded data again. Safe to call when the session is off, as a test's \`beforeEach\` might: it then changes nothing.\n\n${SESSION_DOCS}`,
  request: {
    query: z.object({
      dataset: z.string().optional().openapi({ description: 'Reset only this dataset, at every seed and locale.' }),
    }),
  },
  responses: {
    200: {
      description: 'The session after the reset, and how many datasets were put back.',
      content: {
        'application/json': {
          schema: SessionState.extend({
            reset: z.number().int().openapi({ description: 'Datasets put back.' }),
          }).openapi('SessionReset'),
        },
      },
    },
  },
});

/** `GET /session` and `POST /reset` for the app's session. */
export function sessionRoutes(session: Session) {
  return new OpenAPIHono()
    .openapi(getRoute, (c) => c.json(session.summary()))
    .openapi(resetRoute, (c) => {
      const reset = session.reset(pick(c.req.query(), 'dataset'));
      return c.json({ ...session.summary(), reset });
    });
}
