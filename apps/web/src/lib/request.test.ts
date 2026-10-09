import { createApp } from 'rest-in-pieces/core';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from './config.ts';
import { buildRequestUrl, curlCommand, extractRows, fetchSnippet, isLocalApi } from './request.ts';

const base = defaultConfig('http://localhost:6800/');

describe('buildRequestUrl', () => {
  it('keeps the default request short', () => {
    expect(buildRequestUrl(base)).toBe('http://localhost:6800/names?limit=10');
  });

  it('includes paging, sorting, search, filters, format and simulation', () => {
    const url = new URL(
      buildRequestUrl({
        ...base,
        endpoint: 'users',
        offset: 10,
        seed: 7,
        max: 25,
        sortBy: 'age',
        sortType: 'numeric',
        sortDirection: 'desc',
        q: ' ada ',
        filters: [
          { id: 1, field: 'gender', operator: 'eq', value: 'female' },
          { id: 2, field: 'age', operator: 'gte', value: '30' },
          { id: 3, field: 'city', operator: 'eq', value: ' ' },
        ],
        metadata: false,
        format: 'csv',
        delay: '500',
        trickle: 200,
        status: 503,
      }),
    );
    expect(url.pathname).toBe('/users');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '10',
      offset: '10',
      seed: '7',
      max: '25',
      sortBy: 'age:numeric',
      sortDirection: 'desc',
      q: 'ada',
      gender: 'female',
      'age[gte]': '30',
      metadata: 'false',
      format: 'csv',
      delay: '500',
      trickle: '200',
      status: '503',
    });
  });

  it('names the page by offset, page number or cursor', () => {
    const config = { ...base, offset: 20, limit: 10 };
    expect(buildRequestUrl(config)).toBe('http://localhost:6800/names?limit=10&offset=20');
    expect(buildRequestUrl({ ...config, paging: 'page' })).toBe('http://localhost:6800/names?page=3&pageSize=10');
    expect(buildRequestUrl({ ...config, paging: 'cursor', offset: 0 })).toBe(
      'http://localhost:6800/names?limit=10&cursor=',
    );
    const cursor = new URL(buildRequestUrl({ ...config, paging: 'cursor' })).searchParams.get('cursor');
    expect(cursor).toMatch(/^[\w-]+$/);
    expect(new URL(buildRequestUrl({ ...config, paging: 'cursor', q: 'ada' })).searchParams.get('cursor')).not.toBe(
      cursor,
    );
  });

  it('builds cursors the API accepts and would have issued itself', async () => {
    const app = createApp();
    const config = {
      ...base,
      paging: 'cursor' as const,
      seed: 4,
      q: 'e',
      sortBy: 'age',
      sortType: 'numeric' as const,
      filters: [
        { id: 1, field: 'gender', operator: 'eq' as const, value: 'female' },
        { id: 2, field: 'province', operator: 'eq' as const, value: 'Ontario,British Columbia' },
      ],
    };
    const first = await app.request(buildRequestUrl(config).replace('http://localhost:6800', ''));
    const { metadata } = (await first.json()) as { metadata: { nextCursor: string | null } };
    expect(metadata.nextCursor).toBeTruthy();
    const second = buildRequestUrl({ ...config, offset: config.limit });
    expect(new URL(second).searchParams.get('cursor')).toBe(metadata.nextCursor);
    expect((await app.request(second.replace('http://localhost:6800', ''))).status).toBe(200);
  });

  it('asks countries for the envelope only when metadata is on, and drops the seed', () => {
    expect(buildRequestUrl({ ...base, endpoint: 'countries', seed: 9, metadata: true }, false)).toBe(
      'http://localhost:6800/countries?limit=10&metadata=true',
    );
  });

  it('sends the field list for /generate and a failure rate', () => {
    const url = new URL(
      buildRequestUrl({
        ...base,
        endpoint: 'generate',
        failRate: 0.3,
        fields: [
          { id: 1, name: 'name', type: 'person.fullName' },
          { id: 2, name: 'email', type: 'internet.email' },
        ],
      }),
    );
    expect(url.searchParams.get('fields')).toBe('name:person.fullName,email:internet.email');
    expect(url.searchParams.get('fail')).toBe('0.3');
  });
});

describe('messy data', () => {
  it('asks for the default share as true and any other as a number', () => {
    expect(new URL(buildRequestUrl({ ...base, messy: 0.15 })).searchParams.get('messy')).toBe('true');
    expect(new URL(buildRequestUrl({ ...base, messy: 0.5 })).searchParams.get('messy')).toBe('0.5');
    expect(new URL(buildRequestUrl({ ...base, messy: 0 })).searchParams.has('messy')).toBe(false);
  });

  it('builds cursors that carry messy, as the API does', async () => {
    const app = createApp();
    const config = { ...base, paging: 'cursor' as const, messy: 0.5 };
    const first = await app.request(buildRequestUrl(config).replace('http://localhost:6800', ''));
    const { metadata } = (await first.json()) as { metadata: { nextCursor: string | null } };
    const second = buildRequestUrl({ ...config, offset: config.limit });
    expect(new URL(second).searchParams.get('cursor')).toBe(metadata.nextCursor);
    const clean = buildRequestUrl({ ...config, offset: config.limit, messy: 0 });
    expect(new URL(clean).searchParams.get('cursor')).not.toBe(metadata.nextCursor);
  });
});

describe('simulation parameters', () => {
  it('sends a delay range as typed, tidied, and leaves out one that does not validate', () => {
    const delayOf = (delay: string) => new URL(buildRequestUrl({ ...base, delay })).searchParams.get('delay');
    expect(delayOf('200-800')).toBe('200-800');
    expect(delayOf(' 200 - 800 ')).toBe('200-800');
    expect(delayOf('300-300')).toBe('300');
    for (const delay of ['', '0', '800-200', '200-', '20000', 'abc']) expect(delayOf(delay), delay).toBeNull();
  });
});

describe('snippets', () => {
  it('quotes shell arguments safely', () => {
    expect(curlCommand("http://x/?q=it's", 'csv')).toBe(`curl -i -H 'Accept: text/csv' 'http://x/?q=it'\\''s'`);
  });

  it('writes a fetch call that reads the right body type', () => {
    expect(fetchSnippet('http://x/', 'json')).toContain('response.json()');
    expect(fetchSnippet('http://x/', 'xml')).toContain('response.text()');
  });
});

describe('helpers', () => {
  it('tells local APIs from remote ones', () => {
    expect(isLocalApi('http://127.0.0.1:6800')).toBe(true);
    expect(isLocalApi('https://api.example.com')).toBe(false);
    expect(isLocalApi('not a url')).toBeNull();
  });

  it('finds rows in enveloped, renamed, bare and single-record bodies', () => {
    expect(extractRows({ metadata: { output: { results: 'rows' } }, rows: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(extractRows([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(extractRows({ a: 1 })).toEqual([{ a: 1 }]);
    expect(extractRows([1, 2])).toBeNull();
    expect(extractRows('text')).toBeNull();
  });
});
