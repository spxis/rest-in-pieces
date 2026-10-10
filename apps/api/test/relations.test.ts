import { describe, expect, it } from 'vitest';
import { createApp } from '../src/core.ts';
import { childRange, ownership, parentAt } from '../src/data/owners.ts';
import { loadComments, loadOrders, loadPosts, loadReviews, loadTodos } from '../src/data/related.ts';
import { loadProducts, loadUsers } from '../src/data/seeded.ts';
import { countryLocale, LOCALES } from '../src/lib/locale.ts';
import { MAX_EMBEDDED } from '../src/lib/relations.ts';
import { type Envelope, request } from './helpers.ts';

type Fields = Record<string, unknown>;
type Item = { productId: number; name: string; quantity: number; unitPrice: number; lineTotal: number };
type Order = Fields & {
  id: number;
  userId: number;
  items: Item[];
  subtotal: number;
  tax: number;
  taxRate: number;
  total: number;
  currency: string;
  itemCount: number;
  orderStatus: string;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
};

const time = (value: unknown) => new Date(String(value)).getTime();
const NESTED = [
  ['users', 'orders', 'userId'],
  ['users', 'posts', 'userId'],
  ['users', 'todos', 'userId'],
  ['posts', 'comments', 'postId'],
  ['products', 'reviews', 'productId'],
] as const;

describe('related datasets', () => {
  it('number their records from 1, in order, and join them to records that exist', () => {
    const users = loadUsers(1, 'en-CA').records;
    const products = loadProducts(1, 'en-CA').records;
    const posts = loadPosts(1, 'en-CA').records;
    for (const load of [loadOrders, loadPosts, loadComments, loadTodos, loadReviews]) {
      const { records } = load(1, 'en-CA') as unknown as { records: Fields[] };
      expect(records.length).toBeGreaterThan(900);
      expect(records.map((r) => r.id)).toEqual(records.map((_, i) => i + 1));
      for (const record of records) {
        if ('userId' in record) expect(users[Number(record.userId) - 1]?.id).toBe(record.userId);
        if ('productId' in record) expect(products[Number(record.productId) - 1]?.id).toBe(record.productId);
        if ('postId' in record) expect(posts[Number(record.postId) - 1]?.id).toBe(record.postId);
      }
    }
    for (const order of loadOrders(1, 'en-CA').records) {
      for (const item of order.items) expect(products[item.productId - 1]?.name).toBe(item.name);
    }
  });

  it('own children by seed alone, so every locale has the same ids and owners', () => {
    const ids = (records: readonly Fields[]) => records.map((r) => `${r.id}:${r.userId ?? r.postId ?? r.productId}`);
    for (const load of [loadOrders, loadPosts, loadComments, loadTodos, loadReviews]) {
      const base = ids(load(3, 'en-CA').records as unknown as Fields[]);
      expect(ids(load(3, 'ja').records as unknown as Fields[])).toEqual(base);
      expect(ids(load(3, 'global').records as unknown as Fields[])).toEqual(base);
      expect(ids(load(4, 'en-CA').records as unknown as Fields[])).not.toEqual(base);
    }
  });

  it('find children by arithmetic: a range per parent, and the parent of any child', () => {
    const owned = ownership(2, 'orders');
    const orders = loadOrders(2, 'en-CA').records;
    expect(owned.total).toBe(orders.length);
    for (const userId of [1, 2, 500, 1000]) {
      const [from, to] = childRange(owned, userId) as [number, number];
      expect(orders.slice(from, to).every((order) => order.userId === userId)).toBe(true);
      for (let at = from; at < to; at++) expect(parentAt(owned, at)).toBe(userId);
    }
    expect(childRange(owned, 0)).toBeNull();
    expect(childRange(owned, 1001)).toBeNull();
    expect(childRange(owned, 1.5)).toBeNull();
    expect(ownership(2, 'comments').starts.length).toBe(loadPosts(2, 'en-CA').records.length + 1);
  });

  it('add up: lines, subtotal, tax at the locale rate, and total, in the locale currency', () => {
    for (const locale of ['en-CA', 'ja', 'de', 'vi'] as const) {
      const info = countryLocale(locale);
      const decimals = info.priceScale >= 100 ? 0 : 2;
      const unit = 10 ** decimals;
      for (const order of loadOrders(1, locale).records as Order[]) {
        expect(order.currency).toBe(info.currency);
        expect(order.taxRate).toBe(info.taxRate);
        const cents = order.items.map((item) => Math.round(item.lineTotal * unit));
        for (const item of order.items) {
          expect(Math.round(item.lineTotal * unit)).toBe(Math.round(item.unitPrice * unit) * item.quantity);
        }
        const subtotal = cents.reduce((a, b) => a + b, 0);
        expect(Math.round(order.subtotal * unit)).toBe(subtotal);
        expect(Math.round(order.tax * unit)).toBe(Math.round(subtotal * info.taxRate));
        expect(Math.round(order.total * unit)).toBe(subtotal + Math.round(order.tax * unit));
        expect(order.itemCount).toBe(order.items.reduce((sum, item) => sum + item.quantity, 0));
        if (decimals === 0) expect(Number.isInteger(order.total)).toBe(true);
      }
    }
  });

  it('price a global order in its buyer’s currency, from products in that currency', () => {
    const products = loadProducts(5, 'global').records;
    const currencies = new Set<string>(LOCALES.map((l) => l.currency));
    for (const order of loadOrders(5, 'global').records as Order[]) {
      expect(currencies.has(order.currency)).toBe(true);
      for (const item of order.items) expect(products[item.productId - 1]?.currency).toBe(order.currency);
    }
  });

  it('keep dates in order: joined, ordered, shipped, delivered; posted, commented; listed, reviewed', () => {
    const users = loadUsers(1, 'en-CA').records;
    const products = loadProducts(1, 'en-CA').records;
    const posts = loadPosts(1, 'en-CA').records;
    for (const order of loadOrders(1, 'en-CA').records as Order[]) {
      expect(time(order.createdAt)).toBeGreaterThanOrEqual(time(users[order.userId - 1]?.createdAt));
      if (order.shippedAt) expect(time(order.shippedAt)).toBeGreaterThan(time(order.createdAt));
      if (order.deliveredAt) expect(time(order.deliveredAt)).toBeGreaterThan(time(order.shippedAt));
      expect(order.shippedAt !== null).toBe(['shipped', 'delivered', 'refunded'].includes(order.orderStatus));
      expect(order.deliveredAt !== null).toBe(['delivered', 'refunded'].includes(order.orderStatus));
    }
    const comments = loadComments(1, 'en-CA').records;
    for (const comment of comments) {
      const post = posts[comment.postId - 1];
      expect(time(comment.createdAt)).toBeGreaterThan(time(post?.createdAt));
      expect(comment.userId).not.toBe(post?.userId);
      const previous = comments[comment.id - 2];
      if (previous?.postId === comment.postId) {
        expect(time(comment.createdAt)).toBeGreaterThanOrEqual(time(previous.createdAt));
      }
    }
    for (const review of loadReviews(1, 'en-CA').records) {
      expect(time(review.createdAt)).toBeGreaterThanOrEqual(time(products[review.productId - 1]?.createdAt));
      expect(time(review.createdAt)).toBeGreaterThanOrEqual(time(users[review.userId - 1]?.createdAt));
    }
    for (const todo of loadTodos(1, 'en-CA').records) {
      if (todo.dueOn) expect(todo.dueOn >= todo.createdAt.slice(0, 10)).toBe(true);
    }
  });

  it('rate products close to their own rating, with words that match the stars', () => {
    const products = loadProducts(1, 'en-CA').records;
    const reviews = loadReviews(1, 'en-CA').records;
    for (const review of reviews) {
      expect(Math.abs(review.rating - (products[review.productId - 1]?.rating ?? 0))).toBeLessThanOrEqual(2);
    }
    const unhappy = reviews.filter((r) => r.rating <= 2).map((r) => r.title);
    expect(unhappy.length).toBeGreaterThan(0);
    expect(unhappy.some((title) => /Excellent|Worth|Would buy again/.test(title))).toBe(false);
  });

  it('write Japanese text for ja, and the locale’s lorem elsewhere', () => {
    const [post] = loadPosts(1, 'ja').records;
    expect(post?.title).toMatch(/[぀-ヿ一-鿿]/);
    expect(loadComments(1, 'ja').records[0]?.body).toMatch(/[぀-ヿ一-鿿]/);
    expect(loadTodos(1, 'ja').records[0]?.title).toMatch(/[぀-ヿ一-鿿]/);
    expect(loadReviews(1, 'ja').records[0]?.body).toMatch(/。$/);
    expect(loadPosts(1, 'ru').records[0]?.title).toMatch(/[Ѐ-ӿ]/);
    expect(loadComments(1, 'en-CA').records[0]?.name).toMatch(/^\S+ \S+/);
    expect(loadComments(1, 'ja').records[0]?.name).toMatch(/^\S+ \S+$/);
  });

  it('do not change the datasets they read', async () => {
    const before = JSON.stringify((await request('/users?limit=1000&seed=11')).body.results);
    loadOrders(11, 'en-CA');
    loadReviews(11, 'en-CA');
    expect(JSON.stringify((await request('/users?limit=1000&seed=11')).body.results)).toBe(before);
  });
});

describe('nested routes', () => {
  it.each(NESTED)('/%s/{id}/%s lists exactly what the %s filter does', async (parent, child, key) => {
    for (const id of [1, 2, 3, 77]) {
      const filtered = await request(`/${child}?${key}=${id}&limit=100&seed=6`);
      const nested = await request(`/${parent}/${id}/${child}?limit=100&seed=6`);
      expect(nested.status).toBe(200);
      expect(nested.body.results).toEqual(filtered.body.results);
      expect(nested.res.headers.get('x-total-count')).toBe(String(filtered.body.metadata.total));
      const messy = await request(`/${parent}/${id}/${child}?limit=100&seed=6&messy=0.4`);
      expect(messy.body.results).toEqual(
        (await request(`/${child}?${key}=${id}&limit=100&seed=6&messy=0.4`)).body.results,
      );
    }
  });

  it('pages, sorts, filters, searches and formats like any list', async () => {
    const id = loadOrders(1, 'en-CA').records.find(
      (order, _, all) => all.filter((o) => o.userId === order.userId).length >= 3,
    )?.userId;
    const page = await request<Envelope<Order>>(
      `/users/${id}/orders?limit=1&offset=1&sortBy=total:numeric&sortDirection=desc`,
    );
    expect(page.body.metadata.count).toBe(1);
    expect(page.body.metadata.links.next ?? page.body.metadata.links.prev).toContain(`/users/${id}/orders?`);
    expect(page.res.headers.get('link')).toContain(`/users/${id}/orders`);
    expect(page.res.headers.get('etag')).toBeTruthy();
    const csv = await request(`/users/${id}/orders?format=csv`);
    expect(csv.res.headers.get('content-type')).toContain('text/csv');
    const sql = await request(`/users/${id}/orders?format=sql`);
    expect(sql.text).toMatch(/^INSERT INTO "orders"/);
    const cursor = await request<Envelope>(`/users/${id}/orders?limit=1&cursor=`);
    expect(cursor.body.metadata.nextCursor).toBeTruthy();
    const ja = await request<Envelope<Order>>(`/users/${id}/orders?locale=ja`);
    expect(ja.body.results.every((order) => order.currency === 'JPY')).toBe(true);
    expect(ja.res.headers.get('content-language')).toBe('ja');
  });

  it('answer 404 for a parent that does not exist, and an empty page for one with no children', async () => {
    expect((await request('/users/1001/orders')).status).toBe(404);
    expect((await request('/posts/99999/comments')).status).toBe(404);
    expect((await request('/products/abc/reviews')).status).toBe(404);
    const owned = ownership(1, 'orders');
    const lonely = Array.from({ length: 1000 }, (_, i) => i + 1).find((id) => {
      const [a, b] = childRange(owned, id) as [number, number];
      return a === b;
    });
    const empty = await request(`/users/${lonely}/orders`);
    expect(empty.status).toBe(200);
    expect(empty.body.results).toEqual([]);
  });

  it('simulate and protect like their parents', async () => {
    expect((await request('/users/2/orders?status=503')).status).toBe(503);
    expect((await request('/users/2/orders?auth=required')).status).toBe(401);
  });
});

describe('expand', () => {
  it('embeds the buyer and every item’s product, as their own routes show them', async () => {
    const { body } = await request<Order>('/orders/1?expand=user,items.product&seed=4');
    const user = (await request(`/users/${body.userId}?seed=4`)).body;
    expect(body.user).toEqual(user);
    for (const item of body.items as Array<Item & { product: Fields }>) {
      expect(item.product).toEqual((await request(`/products/${item.productId}?seed=4`)).body);
    }
  });

  it('applies to the page only, two levels deep, in lists and nested lists', async () => {
    const { body } = await request<Envelope<Fields>>('/comments?limit=3&expand=post.user,user');
    for (const comment of body.results) {
      const post = comment.post as Fields;
      expect(post.id).toBe(comment.postId);
      expect((post.user as Fields).id).toBe(post.userId);
      expect((comment.user as Fields).id).toBe(comment.userId);
    }
    const posts = await request<Envelope<Fields>>('/users/2/posts?expand=comments');
    for (const post of posts.body.results) {
      const listed = (await request<Envelope>(`/posts/${post.id}/comments?limit=10`)).body.results;
      expect(post.comments).toEqual(listed);
    }
    const users = await request<Envelope<Fields>>('/users?limit=2&expand=orders,todos,posts');
    for (const user of users.body.results) {
      expect(user.orders).toEqual((await request<Envelope>(`/users/${user.id}/orders?limit=10`)).body.results);
    }
    const reviewed = await request<Envelope<Fields>>('/products?limit=2&expand=reviews.user');
    for (const product of reviewed.body.results) {
      for (const review of product.reviews as Fields[]) expect((review.user as Fields).id).toBe(review.userId);
    }
  });

  it('keeps what messy and safe do, so an embedded record reads as it does on its own', async () => {
    const order = (await request<Order>('/orders/9?expand=user&messy=0.5&safe=true&seed=2')).body;
    expect(order.user).toEqual((await request(`/users/${order.userId}?messy=0.5&safe=true&seed=2`)).body);
  });

  it('refuses what it cannot do, saying what it can', async () => {
    const unknown = await request<{ error: string }>('/orders?expand=buyer');
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toContain('orders can expand: user,');
    expect((await request<{ error: string }>('/comments?expand=post.user.orders')).body.error).toContain('2 at most');
    expect((await request<{ error: string }>('/orders?expand=items')).body.error).toContain('items.product');
    expect((await request<{ error: string }>('/orders?expand=a,b,c,d,e,f,g')).body.error).toContain('at most 6');
    expect((await request<{ error: string }>('/invoices?expand=user')).body.error).toContain('nothing to expand');
    const big = await request<{ error: string }>('/users?limit=1000&expand=todos,orders,posts.comments');
    expect(big.status).toBe(400);
    expect(big.body.error).toContain(String(MAX_EMBEDDED));
    expect((await request('/orders?expand=')).status).toBe(200);
  });

  it('is listed in /resources and the OpenAPI document', async () => {
    const resources = (await request<Array<{ name: string; expand: string[]; nested: string[] }>>('/resources')).body;
    expect(resources.find((r) => r.name === 'orders')?.expand).toContain('items.product');
    expect(resources.find((r) => r.name === 'users')?.nested).toEqual(['orders', 'posts', 'todos']);
    const doc = (
      await request<{ paths: Record<string, Record<string, { parameters: Array<{ name: string }> }>> }>('/openapi.json')
    ).body;
    for (const [parent, child] of NESTED) expect(doc.paths[`/${parent}/{id}/${child}`]?.get).toBeDefined();
    expect(doc.paths['/orders']?.get?.parameters.map((p) => p.name)).toContain('expand');
  });
});

describe('JSONPlaceholder shapes', () => {
  it('keep the fields a JSONPlaceholder tutorial reads', async () => {
    const pick = async (path: string) =>
      (await request<Envelope>(`${path}?limit=1&metadata=false`)).body as unknown as Fields[];
    expect(Object.keys((await pick('/posts'))[0] ?? {})).toEqual(
      expect.arrayContaining(['userId', 'id', 'title', 'body']),
    );
    expect(Object.keys((await pick('/comments'))[0] ?? {})).toEqual(
      expect.arrayContaining(['postId', 'id', 'name', 'email', 'body']),
    );
    expect(Object.keys((await pick('/todos'))[0] ?? {})).toEqual(
      expect.arrayContaining(['userId', 'id', 'title', 'completed']),
    );
    expect(
      (await request<Fields[]>('/posts?userId=1&metadata=false&limit=100')).body.every((p) => p.userId === 1),
    ).toBe(true);
    const created = await createApp().request('/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'foo', body: 'bar', userId: 1 }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ title: 'foo', body: 'bar', userId: 1 });
  });
});

describe('/jsonplaceholder', () => {
  const get = async (path: string, init?: RequestInit) => {
    const res = await createApp().request(`/jsonplaceholder${path}`, init);
    return { status: res.status, body: (await res.json()) as unknown };
  };

  it('answers a tutorial’s requests with bare arrays as long as JSONPlaceholder’s', async () => {
    const lengths: Record<string, number> = { '/posts': 100, '/comments': 500, '/todos': 200, '/users': 10 };
    for (const [path, length] of Object.entries(lengths)) {
      const { status, body } = await get(path);
      expect(status, path).toBe(200);
      expect(Array.isArray(body) && body.length, path).toBe(length);
    }
    for (const path of [
      '/users/1/posts',
      '/users/1/todos',
      '/posts/1/comments',
      '/posts?userId=1',
      '/comments?postId=1',
    ]) {
      const { body } = await get(path);
      expect(Array.isArray(body) && body.length > 0, path).toBe(true);
    }
    const byUser = (await get('/posts?userId=1')).body as Fields[];
    expect(byUser).toEqual((await get('/users/1/posts')).body);
    expect(((await get('/posts/1')).body as Fields).id).toBe(1);
    expect(((await get('/posts?limit=3')).body as Fields[]).length).toBe(3);
    expect(((await get('/posts?metadata=true&limit=2')).body as Envelope).metadata.count).toBe(2);
    expect((await get('/albums')).status).toBe(404);
  });

  it('gives users JSONPlaceholder’s name, address, website and company', async () => {
    const [user] = (await get('/users')).body as Fields[];
    expect(user).toMatchObject({
      id: 1,
      name: expect.stringMatching(/^\S+ \S+$/),
      website: expect.stringMatching(/\.example\.org$/),
    });
    expect(user?.address).toEqual({ city: expect.any(String), country: 'CA' });
    expect(user?.company).toEqual({ name: expect.any(String) });
    const one = (await get('/users/1?locale=ja')).body as Fields;
    expect(one.name).toBe(`${one.lastName} ${one.firstName}`);
    const page = (await get('/users?metadata=true&limit=2')).body as Envelope<Fields>;
    expect(page.results[0]?.address).toBeDefined();
    expect((await get('/users/99999')).status).toBe(404);
  });

  it('takes the writes a tutorial makes', async () => {
    const json = { 'Content-Type': 'application/json; charset=UTF-8' };
    const created = await get('/posts', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ title: 'foo', body: 'bar', userId: 1 }),
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: 'foo', body: 'bar', userId: 1 });
    const put = await get('/posts/1', {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ id: 1, title: 'foo', body: 'bar', userId: 1 }),
    });
    expect(put.status).toBe(200);
    const patched = await get('/posts/1', { method: 'PATCH', headers: json, body: JSON.stringify({ title: 'foo' }) });
    expect(patched.body).toMatchObject({ id: 1, title: 'foo' });
    const res = await createApp().request('/jsonplaceholder/posts/1', { method: 'DELETE' });
    expect(res.status).toBe(204);
  });
});
