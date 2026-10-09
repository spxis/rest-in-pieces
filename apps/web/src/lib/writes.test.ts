import { createApp } from '@johnmorrisdotca/rest-in-pieces/core';
import { describe, expect, it } from 'vitest';
import { defaultConfig, METHODS, takesBody } from './config.ts';
import { buildRequestUrl, curlCommand, fetchSnippet } from './request.ts';
import { isJson, sampleBody } from './samples.ts';

const base = defaultConfig('http://localhost:6800/');
const DATASETS = ['names', 'users', 'products', 'companies'];

describe('write requests', () => {
  it('names the collection for POST and the record for the others', () => {
    expect(buildRequestUrl({ ...base, endpoint: 'users', method: 'POST' })).toBe('http://localhost:6800/users');
    expect(buildRequestUrl({ ...base, endpoint: 'users', method: 'PATCH', recordId: '42' })).toBe(
      'http://localhost:6800/users/42',
    );
  });

  it('keeps seed, locale, conflict and simulation, and drops paging, filters and format', () => {
    const url = new URL(
      buildRequestUrl({
        ...base,
        method: 'PUT',
        recordId: '7',
        seed: 9,
        locale: 'ja',
        conflict: true,
        status: 503,
        offset: 20,
        q: 'ada',
        format: 'csv',
        filters: [{ id: 1, field: 'gender', operator: 'eq', value: 'female' }],
      }),
    );
    expect(url.pathname).toBe('/names/7');
    expect(Object.fromEntries(url.searchParams)).toEqual({ seed: '9', locale: 'ja', conflict: 'true', status: '503' });
    // A new record's id does not depend on the dataset, so a POST leaves seed and locale out.
    const post = new URL(buildRequestUrl({ ...base, method: 'POST', seed: 9, locale: 'ja', delay: '200' }));
    expect(Object.fromEntries(post.searchParams)).toEqual({ delay: '200' });
  });

  it('writes curl and fetch with the method, the JSON body and JSON in return', () => {
    const body = '{\n  "city": "Halifax"\n}';
    expect(curlCommand('http://x/users/1', 'csv', { method: 'PATCH', body })).toBe(
      `curl -i -X PATCH -H 'Accept: application/json' -H 'Content-Type: application/json' -d '{"city":"Halifax"}' 'http://x/users/1'`,
    );
    expect(curlCommand('http://x/users/1', 'json', { method: 'DELETE' })).toBe(
      `curl -i -X DELETE -H 'Accept: application/json' 'http://x/users/1'`,
    );
    expect(fetchSnippet('http://x/users', 'xml', { method: 'POST', body })).toBe(
      [
        'const response = await fetch("http://x/users", {',
        "  method: 'POST',",
        `  headers: { Accept: "application/json", 'Content-Type': 'application/json' },`,
        '  body: JSON.stringify({"city":"Halifax"}),',
        '});',
        'const data = await response.json();',
      ].join('\n'),
    );
    expect(fetchSnippet('http://x/users/1', 'json', { method: 'DELETE' })).toContain('response.status === 204');
    // A body that is not JSON goes as typed, so the snippet reproduces the 400 too.
    expect(fetchSnippet('http://x/users', 'json', { method: 'POST', body: '{bad' })).toContain('body: "{bad",');
    expect(curlCommand('http://x/users', 'json', { method: 'POST', body: "{bad'" })).toContain(`-d '{bad'\\'''`);
  });

  it('starts each writable dataset with a body the API accepts', async () => {
    const app = createApp();
    for (const endpoint of DATASETS) {
      for (const method of METHODS.filter(takesBody)) {
        const body = sampleBody(endpoint, method);
        expect(isJson(body), `${endpoint} ${method}`).toBe(true);
        const path = method === 'POST' ? `/${endpoint}` : `/${endpoint}/1`;
        const response = await app.request(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        expect(response.status, `${method} ${path}: ${await response.clone().text()}`).toBe(
          method === 'POST' ? 201 : 200,
        );
      }
    }
    expect(sampleBody('users', 'DELETE')).toBe('');
    expect(isJson('{"a":')).toBe(false);
  });
});
