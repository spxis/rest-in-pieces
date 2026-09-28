import { serve } from '@hono/node-server';
import { app } from './app.ts';

const port = Number(process.env.PORT ?? 8080);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`REST in Pieces listening on http://localhost:${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
