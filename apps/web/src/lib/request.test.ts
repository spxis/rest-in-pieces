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
        delay: 500,
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
      status: '503',
    });
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
