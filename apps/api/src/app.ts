import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { responseControls } from './lib/response.ts';
import { countries } from './routes/countries.ts';
import { generate } from './routes/generate.ts';
import { generators } from './routes/generators.ts';
import { home } from './routes/home.ts';
import { names } from './routes/names.ts';
import { openapi } from './routes/openapi.ts';

export const app = new Hono();

if (process.env.NODE_ENV !== 'test') app.use(logger());
app.use(secureHeaders());
app.use(cors());
app.use(responseControls);

if (process.env.SERVE_WEB === 'true') {
  const webRoot = process.env.WEB_ROOT ?? '../web/dist';
  app.use('/assets/*', serveStatic({ root: webRoot }));
  app.get('/', serveStatic({ root: webRoot, path: 'index.html' }));
} else {
  app.route('/', home);
}
app.route('/names', names);
app.route('/random-names', names);
app.route('/countries', countries);
app.route('/generate', generate);
app.route('/generators', generators);
app.route('/', openapi);
app.get('/health', (c) => c.json({ status: 'ok' }));

app.notFound((c) => c.json({ error: 'Not Found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
