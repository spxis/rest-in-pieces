import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { countries } from './routes/countries.ts';
import { home } from './routes/home.ts';
import { names } from './routes/names.ts';

export const app = new Hono();

if (process.env.NODE_ENV !== 'test') app.use(logger());
app.use(secureHeaders());
app.use(cors());

app.route('/', home);
app.route('/names', names);
app.route('/random-names', names);
app.route('/countries', countries);
app.get('/health', (c) => c.json({ status: 'ok' }));

app.notFound((c) => c.json({ error: 'Not Found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
