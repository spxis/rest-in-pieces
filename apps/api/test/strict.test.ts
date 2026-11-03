import { describe, expect, it } from 'vitest';
import { request } from './helpers.ts';

type Failure = { error: string };

/** Each of these answers 200 with data by default, which is what strict mode is for. */
const LENIENT: Array<[string, RegExp]> = [
  ['id[bogus]=5', /"id\[bogus\]" uses the operator "bogus"/],
  ['age[gte]=30', /"age\[gte\]" is not a parameter or a field/],
  ['foo=bar', /"foo" is not a parameter or a field/],
  ['sort=email.asc', /"sort" is not a parameter or a field \(to sort, use sortBy and sortDirection\)/],
  ['sortBy=nope', /sortBy "nope" is not a field/],
  ['sortBy=id:bogus', /sortBy type "bogus" is not one/],
  ['sortDirection=up', /sortDirection "up" is not one/],
  ['limit=abc', /limit must be a whole number, not "abc"/],
  ['offset=-1', /offset must be a whole number/],
  ['page=1.5', /page must be a whole number/],
  ['messy=100', /messy is a share from 0 to 1 \(0\.2 is one value in five\), not "100"/],
  ['fail=15', /fail is true, false or a share from 0 to 1 \(0\.2 fails one request in five\), not "15"/],
];

describe('strict=true', () => {
  it.each(LENIENT)('refuses %s with the standard error body, where the default answers 200', async (query, message) => {
    const lenient = await request(`/users?${query}`);
    // `fail=15` always fails: a simulated 500, which is the lenient reading of "15".
    expect(lenient.status, query).toBe(query.startsWith('fail=') ? 500 : 200);
    const strict = await request<Failure>(`/users?${query}&strict=true`);
    expect(strict.status, query).toBe(400);
    expect(Object.keys(strict.body)).toEqual(['error']);
    expect(strict.body.error).toMatch(message);
    if (!query.startsWith('fail=')) expect(strict.body.error).toContain('Fields: id, firstName');
  });

  it('names everything wrong at once', async () => {
    const { body } = await request<Failure>('/users?strict=true&foo=bar&id[bogus]=1&sortBy=nope&messy=50');
    for (const part of ['"foo"', 'operator "bogus"', 'sortBy "nope"', 'messy is a share'])
      expect(body.error).toContain(part);
  });

  it('lets a good query through, whatever it uses', async () => {
    for (const query of [
      'city=Toronto&limit=2',
      'id[gte]=3&id[lt]=9&sortBy=id:numeric&sortDirection=desc',
      'sortBy=city:string&sortOrder=asc&q=a&messy=0.2&seed=7&locale=ja-JP',
      'page=2&pageSize=5&metadata=false&format=csv',
      'cursor=&limit=3',
      'expand=orders&safe=false&delay=0',
      'messy=true&fail=0.0',
      'city=',
    ]) {
      const { status, text } = await request(`/users?strict=true&${query}`);
      expect(status, `${query}: ${text.slice(0, 200)}`).toBe(200);
    }
  });

  it('is off by default and by strict=false, and a key that is a field of another dataset is unknown here', async () => {
    expect((await request('/users?foo=bar&sort=email.asc&limit=1')).status).toBe(200);
    expect((await request('/users?strict=false&foo=bar&limit=1')).status).toBe(200);
    const { body } = await request<Failure>('/users?strict=true&sku=AE-1');
    expect(body.error).toContain('"sku"');
    expect((await request('/products?strict=true&sku=AE-1')).status).toBe(200);
  });

  it('applies to nested lists and to datasets that are not users', async () => {
    expect((await request('/users/1/orders?strict=true&nope=1')).status).toBe(400);
    expect((await request('/users/1/orders?strict=true&limit=2')).status).toBe(200);
    expect((await request('/countries?strict=true&foo=1')).status).toBe(400);
    expect((await request('/countries?strict=true&continent=Europe&limit=2')).status).toBe(200);
  });

  it('is a documented parameter, and not a filter on a field called strict', async () => {
    const spec = (
      await request<{ paths: Record<string, { get: { parameters: Array<{ name: string; description?: string }> } }> }>(
        '/openapi.json',
      )
    ).body;
    const strict = spec.paths['/users']?.get.parameters.find((one) => one.name === 'strict');
    expect(strict?.description).toContain('Units');
    expect(strict?.description).toContain('`messy` and `fail` are shares from 0 to 1');
  });

  it('leaves /generate alone: its own parameters are not fields', async () => {
    const { status } = await request('/generate?fields=a:number.int(1,5)&strict=true&limit=2');
    expect(status).toBe(200);
  });
});

describe('fail as a share', () => {
  it('never fails for 0, 0.0 or less, always for true or 1 or more, and by chance in between', async () => {
    for (const value of ['0', '0.0', '0.00', '-1', 'false'])
      expect((await request(`/users?limit=1&fail=${value}`)).status, value).toBe(200);
    for (const value of ['true', '1', '1.0', '15'])
      expect((await request(`/users?limit=1&fail=${value}`)).status, value).toBe(500);
  });
});
