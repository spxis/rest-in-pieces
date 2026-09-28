import { Hono } from 'hono';
import { html } from 'hono/html';
import pkg from '../../package.json' with { type: 'json' };

const examples = [
  ['/names?limit=10', 'First 10 people'],
  ['/names?limit=25&sortBy=name', 'First 25 people, sorted by name'],
  ['/names?limit=10&sortBy=name&sortDirection=desc', 'First 10 people, sorted by name descending'],
  ['/names?limit=10&sortBy=age:numeric', 'Youngest 10 people'],
  ['/names?limit=10&sortDirection=reverse', 'Last 10 people'],
  ['/names?limit=10&offset=10', 'Next 10 people'],
  ['/names?limit=50&metadata=0', 'First 50 people, without metadata'],
  ['/names?limit=50&max=35', 'First 50 people from a dataset capped at 35'],
  ['/names?limit=10&seed=42', 'Repeatable dataset with a custom seed'],
  ['/names?limit=10&format=csv', 'People as CSV'],
  ['/generate?fields=name:person.fullName,email:internet.email&limit=5&seed=42', 'Custom generated records'],
  ['/names?limit=5&resultsName=rows', 'Results under a custom key'],
  ['/countries?limit=10', 'First 10 countries'],
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
        <p><a href="/docs">Interactive API docs</a> · <a href="/openapi.json">OpenAPI spec</a> · <a href="/generators">Generator types</a></p>
        <ul>
          ${examples.map(([href, label]) => html`<li><a href="${href}">${label}</a> <code>${href}</code></li>`)}
        </ul>
      </body>
    </html>`),
);
