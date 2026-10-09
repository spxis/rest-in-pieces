import { Hono } from 'hono';
import { html } from 'hono/html';
import pkg from '../../package.json' with { type: 'json' };

const examples = [
  ['/names?limit=10', 'First 10 people'],
  ['/names?limit=10&sortBy=age:numeric&sortDirection=desc', 'Oldest 10 people'],
  ['/names?gender=female&age[gte]=30&age[lt]=40', 'Women in their thirties'],
  ['/names?q=ontario&limit=5', 'Text search'],
  ['/names?limit=50&max=35&offset=30', 'The last page of a 35-record dataset'],
  ['/names/42', 'One person by index'],
  ['/users?seed=7&limit=5', 'Users from seed 7'],
  ['/products?department=Books&sortBy=price:numeric', 'Books, cheapest first'],
  ['/companies?limit=5&format=csv', 'Companies as CSV'],
  ['/countries/CA', 'One country by ISO code'],
  ['/names?locale=ja&limit=5', 'Japanese people with readings'],
  ['/products?locale=ja&sortBy=price:numeric', 'Japanese products in yen'],
  ['/generate?fields=name:person.fullName,email:internet.email&limit=5&seed=42', 'Custom records'],
  ['/names?delay=1500', 'A slow response'],
  ['/names?status=503', 'A 503 error'],
  ['/names?fail=0.3', 'Fails 30% of the time'],
  ['/users?auth=required', 'A protected route: 401 until you sign in with POST /auth/login'],
  ['/session', 'What the session holds (writes are kept only with --session)'],
] as const;

export const home = new Hono().get('/', (c) =>
  c.html(html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>REST in Pieces</title>
        <style>
          :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
          body { max-width: 44rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.6; }
          code { font-size: 0.9em; }
        </style>
      </head>
      <body>
        <h1>REST in Pieces <small>v${pkg.version}</small></h1>
        <p>Realistic, repeatable fake data for building and testing client applications.</p>
        <p><a href="/docs">Interactive API docs</a> · <a href="/openapi.json">OpenAPI spec</a> · <a href="/resources">Datasets</a> · <a href="/generators">Generator types</a></p>
        <ul>
          ${examples.map(([href, label]) => html`<li><a href="${href}">${label}</a> <code>${href}</code></li>`)}
        </ul>
      </body>
    </html>`),
);
