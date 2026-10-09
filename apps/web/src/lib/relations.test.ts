import { createApp } from '@johnmorrisdotca/rest-in-pieces/core';
import { describe, expect, it } from 'vitest';
import { splitType } from '../components/FieldsEditor.tsx';
import { cardOf, localAvatar } from '../components/UiPreview.tsx';
import { configFromHash, configToHash, defaultConfig } from './config.ts';
import { downloadOf, fileStem, tableOf } from './download.ts';
import { buildRequestUrl, readPath } from './request.ts';
import { snippetFor } from './snippets.ts';

const base = defaultConfig('http://localhost:6800');
const api = createApp();

describe('relations, safe values and the new formats in a setup', () => {
  it('round-trip through a shared link, and refuse what does not validate', () => {
    const config = {
      ...base,
      endpoint: 'users',
      nested: 'orders',
      parentId: '7',
      expand: ['user', 'items.product'],
      safe: true,
      format: 'sql' as const,
      table: 'shop_orders',
    };
    expect(configFromHash(configToHash(config), base)).toEqual(config);
    const bad = configFromHash('endpoint=users&nested=Orders!&parentId=a b&expand=["x.y.z"]&table=1x&safe=yes', base);
    expect(bad).toMatchObject({ nested: '', parentId: '1', expand: [], table: '', safe: false });
  });

  it('build the nested path, expand, safe and table into the URL', () => {
    expect(readPath({ endpoint: 'users', nested: '', parentId: '7' })).toBe('/users');
    expect(readPath({ endpoint: 'users', nested: 'orders', parentId: ' 7 ' })).toBe('/users/7/orders');
    expect(readPath({ endpoint: 'generate', nested: 'orders', parentId: '7' })).toBe('/generate');
    const url = new URL(
      buildRequestUrl({
        ...base,
        endpoint: 'users',
        nested: 'orders',
        parentId: '7',
        expand: ['user', 'items.product'],
        safe: true,
        format: 'sql',
        table: 'shop',
      }),
    );
    expect(url.pathname).toBe('/users/7/orders');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      expand: 'user,items.product',
      safe: 'true',
      format: 'sql',
      table: 'shop',
    });
    expect(new URL(buildRequestUrl({ ...base, table: 'x' })).searchParams.has('table')).toBe(false);
  });

  it('send requests the API answers', async () => {
    const url = buildRequestUrl({ ...base, endpoint: 'users', nested: 'orders', parentId: '2', expand: ['user'] });
    const response = await api.request(url.replace('http://localhost:6800', ''));
    expect(response.status).toBe(200);
    const { results } = (await response.json()) as { results: Array<{ user: { id: number } }> };
    expect(results.every((order) => order.user.id === 2)).toBe(true);
  });

  it('name files and tables after what was asked for', () => {
    expect(fileStem('http://h/users/2/orders?limit=5')).toBe('orders');
    expect(fileStem('http://h/orders/12')).toBe('orders-12');
    expect(tableOf('http://h/users/2/orders')).toBe('orders');
    expect(tableOf('http://h/users?table=people')).toBe('people');
    expect(tableOf('http://h/users?table=1bad')).toBe('users');
    expect(tableOf('http://h/generate?fields=a:b')).toBe('generated');
    expect(tableOf('http://h/health')).toBe('records');
  });

  it('download NDJSON and SQL from the rows, or the body as it came', () => {
    const rows = [{ id: 1, name: "O'Brien", active: true }];
    const source = { url: 'http://h/users?limit=1', rows, json: rows, raw: '', contentType: 'application/json' };
    expect(downloadOf(source, 'ndjson')).toEqual({
      filename: 'users.ndjson',
      mime: 'application/x-ndjson',
      text: '{"id":1,"name":"O\'Brien","active":true}\n',
    });
    expect(downloadOf(source, 'sql')?.text).toBe(
      'INSERT INTO "users" ("id", "name", "active") VALUES (1, \'O\'\'Brien\', TRUE);\n',
    );
    const asSql = { ...source, rows: null, json: null, raw: 'INSERT …;', contentType: 'application/sql' };
    expect(downloadOf(asSql, 'sql')?.text).toBe('INSERT …;');
    expect(downloadOf(asSql, 'ndjson')).toBeNull();
    const asNdjson = { ...asSql, raw: '{}\n', contentType: 'application/x-ndjson' };
    expect(downloadOf(asNdjson, 'ndjson')?.text).toBe('{}\n');
    expect(downloadOf(asNdjson, 'sql')).toBeNull();
  });

  it('write openapi-fetch with the nested path template', () => {
    const code = snippetFor('openapi-fetch', {
      url: 'http://localhost:6800/users/7/orders?limit=10',
      apiBase: 'http://localhost:6800',
      format: 'json',
      method: 'GET',
    });
    expect(code).toContain("api.GET('/users/{id}/orders'");
    expect(code).toContain("path: { id: '7' }");
  });
});

describe('the UI preview', () => {
  it('draws this API’s avatars in the page, and leaves other pictures alone', () => {
    const drawn = localAvatar('http://localhost/rest-in-pieces/api/avatars/ada.svg?name=Ada%20Lovelace');
    expect(drawn).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(drawn ?? '')).toContain('>AL<');
    expect(localAvatar('https://cdn.example.com/a.jpg')).toBeNull();
    expect(localAvatar('not a url')).toBeNull();
    expect(localAvatar(null)).toBeNull();
  });

  it('gives orders, posts, comments, todos and reviews cards of their own', () => {
    expect(
      cardOf({
        id: 4,
        orderStatus: 'shipped',
        itemCount: 3,
        items: [{ name: 'Bike' }, { name: 'Salad' }],
        total: 12.5,
        currency: 'CAD',
      }),
    ).toMatchObject({ title: '#4 · shipped', subtitle: '3 × Bike, Salad', aside: '12.5 CAD', thing: true });
    expect(cardOf({ id: 1, productId: 2, rating: 4, title: 'Good', body: 'Fine.\nMore' })).toMatchObject({
      title: 'Good',
      subtitle: 'Fine.',
      aside: '★★★★☆',
    });
    expect(cardOf({ id: 1, postId: 2, name: 'Ada', email: 'a@example.com', body: 'Hi' })).toMatchObject({
      title: 'Ada',
      aside: '',
      thing: false,
    });
    const user = { firstName: 'Ada', lastName: 'Lovelace', avatar: 'http://h/avatars/ada.svg?name=Ada' };
    expect(cardOf({ id: 1, productId: 2, rating: 5, title: 'Good', body: 'Fine.', user })).toMatchObject({
      avatar: user.avatar,
      person: 'Ada Lovelace',
      thing: false,
    });
    expect(cardOf({ id: 1, title: 'Buy milk', completed: true, dueOn: '2026-01-02' })).toMatchObject({
      aside: '✓',
      subtitle: '2026-01-02',
    });
    expect(cardOf({ id: 9, userId: 1, title: 'A post', body: 'Body' })).toMatchObject({ title: 'A post', aside: '#9' });
    expect(cardOf({ sku: 'X', name: 'Thing', price: 1 })).toMatchObject({ thing: true });
  });

  it('splits a field type into its generator and the rest', () => {
    expect(splitType('number.int(18,65)?blank=10')).toEqual({ base: 'number.int', rest: '(18,65)?blank=10' });
    expect(splitType('pick(a,b|1,2)')).toEqual({ base: 'pick', rest: '(a,b|1,2)' });
    expect(splitType(' person.firstName ')).toEqual({ base: 'person.firstName', rest: '' });
  });
});
