import { describe, expect, it } from 'vitest';
import { BEARER_HEADER } from './request.ts';
import { relativePath, SNIPPET_KINDS, type SnippetRequest, snippetFor } from './snippets.ts';

const base: SnippetRequest = {
  url: 'http://localhost:6800/users?limit=10&seed=7',
  apiBase: 'http://localhost:6800/',
  format: 'json',
  method: 'GET',
};

describe('copy-as snippets', () => {
  it('offers the URL and six ways to send it', () => {
    expect(SNIPPET_KINDS).toEqual(['url', 'curl', 'fetch', 'axios', 'openapi-fetch', 'msw', 'vite']);
  });

  it('finds the path under the API base, wherever the API lives', () => {
    expect(relativePath(base.url, base.apiBase)).toBe('/users?limit=10&seed=7');
    expect(relativePath('https://x.test/rest-in-pieces/api/names/3', 'https://x.test/rest-in-pieces/api')).toBe(
      '/names/3',
    );
    expect(relativePath('https://elsewhere.test/users?q=a', 'http://localhost:6800')).toBe('/users?q=a');
  });

  it('writes axios with the method, body and a text response for CSV', () => {
    expect(snippetFor('axios', base)).toContain("await axios.get('http://localhost:6800/users?limit=10&seed=7', {");
    expect(snippetFor('axios', { ...base, format: 'csv' })).toContain("responseType: 'text'");
    const post = snippetFor('axios', {
      ...base,
      url: 'http://localhost:6800/users',
      method: 'POST',
      body: '{"firstName":"Ada"}',
    });
    expect(post).toContain('axios.post(\'http://localhost:6800/users\', {\n    "firstName": "Ada"\n  }, {');
    expect(post).toContain("'Content-Type': 'application/json'");
  });

  it('writes openapi-fetch against the typed paths, with the id and query as params', () => {
    const list = snippetFor('openapi-fetch', base);
    expect(list).toContain("import type { paths } from '@johnmorrisdotca/rest-in-pieces/types';");
    expect(list).toContain("createClient<paths>({ baseUrl: 'http://localhost:6800' })");
    expect(list).toContain("api.GET('/users', {\n  params: { query: { limit: '10', seed: '7' } },\n});");

    const patch = snippetFor('openapi-fetch', {
      ...base,
      url: 'http://localhost:6800/users/42?seed=7',
      method: 'PATCH',
      body: '{"active":false}',
    });
    expect(patch).toContain("api.PATCH('/users/{id}', {");
    expect(patch).toContain("params: { path: { id: '42' }, query: { seed: '7' } }");
    expect(patch).toContain('"active": false');

    const filtered = snippetFor('openapi-fetch', {
      ...base,
      url: 'http://localhost:6800/names?age[gte]=30&format=csv',
      format: 'csv',
    });
    expect(filtered).toContain("'age[gte]': '30'");
    expect(filtered).toContain("parseAs: 'text'");
  });

  it('writes MSW and Vite set-ups that fetch the same path under /api, keeping writes when the API does', () => {
    const msw = snippetFor('msw', base);
    expect(msw).toContain('restInPiecesHandlers({ http })');
    expect(msw).toContain('fetch("/api/users?limit=10&seed=7"');
    expect(snippetFor('msw', { ...base, session: true })).toContain(
      'restInPiecesHandlers({ http, app: { session: true } })',
    );
    const vite = snippetFor('vite', base);
    expect(vite).toContain('plugins: [restInPieces()]');
    expect(vite).toContain('fetch("/api/users?limit=10&seed=7"');
    expect(snippetFor('vite', { ...base, session: true })).toContain('restInPieces({ app: { session: true } })');
  });

  it('signs in first and sends the token when the playground is signed in', () => {
    const signed = { ...base, url: 'http://localhost:6800/users?auth=required', account: 'viewer' };
    const curl = snippetFor('curl', signed);
    expect(curl.split('\n')[0]).toBe(
      `TOKEN=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"username":"viewer","password":"password"}' 'http://localhost:6800/auth/login' | jq -r .accessToken)`,
    );
    expect(curl).toContain('-H "Authorization: Bearer $TOKEN"');
    const fetched = snippetFor('fetch', signed);
    expect(fetched).toContain("body: JSON.stringify({ username: 'viewer', password: 'password' })");
    expect(fetched).toContain('const { accessToken: token } = await login.json();');
    expect(fetched).toContain(BEARER_HEADER);
    for (const kind of ['axios', 'openapi-fetch', 'msw', 'vite'] as const) {
      expect(snippetFor(kind, signed), kind).toContain(BEARER_HEADER);
      expect(snippetFor(kind, signed), kind).toContain(
        "// token: the accessToken from POST /auth/login (username 'viewer'",
      );
    }
    expect(snippetFor('url', signed)).toBe(signed.url);
    expect(snippetFor('curl', base)).not.toContain('Authorization');
  });

  it('shows the method in front of the URL for a write', () => {
    expect(snippetFor('url', { ...base, method: 'DELETE', url: 'http://localhost:6800/users/1' })).toBe(
      'DELETE http://localhost:6800/users/1',
    );
  });
});
