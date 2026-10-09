import { describe, expect, it } from 'vitest';
import { createApp } from '../src/core.ts';
import { loadComments, loadOrders, loadPosts, loadReviews, loadTodos } from '../src/data/related.ts';
import { loadProducts } from '../src/data/seeded.ts';
import { cascade } from '../src/lib/integrity.ts';
import { RequestData } from '../src/lib/relations.ts';
import { createSession } from '../src/lib/session.ts';
import { resourceNamed, resources } from '../src/resources.ts';
import type { Envelope } from './helpers.ts';

type Fields = Record<string, unknown>;
type Failure = { error: string; fields: Record<string, string> };

/** An app of its own, with or without the session, and helpers that read its answers. */
function client(session = true) {
  const app = createApp({ session });
  const call = async <T = Fields>(method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
  };
  return { call, get: <T = Envelope>(path: string) => call<T>('GET', path) };
}

const productIn = (currency: string, locale: 'global' | 'en-CA' = 'global', seed = 1) =>
  loadProducts(seed, locale).records.find((p) => p.currency === currency)?.id as number;

describe('writing orders', () => {
  it('works out names, prices, totals and tax from the products and the buyer’s locale', async () => {
    const api = client(false);
    const products = loadProducts(1, 'en-CA').records;
    const { status, body } = await api.call<Fields & { items: Fields[] }>('POST', '/orders', {
      userId: 3,
      items: [
        { productId: 5, quantity: 2 },
        { productId: 9, quantity: 1 },
      ],
    });
    expect(status).toBe(201);
    const [five, nine] = [products[4], products[8]];
    const subtotal = Math.round((five?.price ?? 0) * 100) * 2 + Math.round((nine?.price ?? 0) * 100);
    expect(body).toMatchObject({
      userId: 3,
      orderStatus: 'pending',
      currency: 'CAD',
      taxRate: 0.13,
      itemCount: 3,
      subtotal: subtotal / 100,
      tax: Math.round(subtotal * 0.13) / 100,
      total: (subtotal + Math.round(subtotal * 0.13)) / 100,
      shippedAt: null,
      deliveredAt: null,
    });
    expect(body.items[0]).toMatchObject({ productId: 5, name: five?.name, quantity: 2, unitPrice: five?.price });
    expect(body.id).toBe(loadOrders(1, 'en-CA').records.length + 1);
  });

  it('answers 422 for a buyer or product that does not exist, or a product in another currency', async () => {
    const api = client(false);
    const noUser = await api.call<Failure>('POST', '/orders', { userId: 5000, items: [{ productId: 1, quantity: 1 }] });
    expect(noUser.status).toBe(422);
    expect(noUser.body.fields).toEqual({ userId: 'No user with id 5000.' });
    const noProduct = await api.call<Failure>('POST', '/orders', {
      userId: 1,
      items: [{ productId: 9999, quantity: 1 }],
    });
    expect(noProduct.body.fields).toEqual({ 'items.0.productId': 'No product with id 9999.' });
    const empty = await api.call<Failure>('POST', '/orders', { userId: 1, items: [] });
    expect(empty.body.fields.items).toContain('at least one item');

    const buyer = loadOrders(1, 'global').records[0] as unknown as Fields;
    const elsewhere = ['JPY', 'EUR', 'USD'].find((currency) => currency !== buyer.currency) as string;
    const mixed = await api.call<Failure>('POST', '/orders?locale=global', {
      userId: buyer.userId,
      items: [{ productId: productIn(elsewhere), quantity: 1 }],
    });
    expect(mixed.status).toBe(422);
    expect(mixed.body.fields['items.0.productId']).toContain(`this buyer pays in ${buyer.currency}`);
    const same = await api.call('POST', '/orders?locale=global', {
      userId: buyer.userId,
      items: [{ productId: productIn(String(buyer.currency)), quantity: 1 }],
    });
    expect(same.status).toBe(201);
  });

  it('moves the dates on with the status, and keeps what was charged when the items are not sent', async () => {
    const api = client();
    const order = (await api.get<Fields>('/orders/1')).body;
    const shipped = await api.call<Fields>('PATCH', '/orders/1', { orderStatus: 'pending' });
    expect(shipped.body).toMatchObject({
      orderStatus: 'pending',
      shippedAt: null,
      deliveredAt: null,
      total: order.total,
    });
    const sent = await api.call<Fields>('PATCH', '/orders/1', { orderStatus: 'shipped' });
    expect(typeof sent.body.shippedAt).toBe('string');
    expect(sent.body.deliveredAt).toBeNull();
    const arrived = await api.call<Fields>('PATCH', '/orders/1', { orderStatus: 'delivered' });
    expect(arrived.body.shippedAt).toBe(sent.body.shippedAt);
    expect(typeof arrived.body.deliveredAt).toBe('string');
    const cancelled = await api.call<Fields>('PATCH', '/orders/1', { orderStatus: 'cancelled' });
    expect(cancelled.body).toMatchObject({ shippedAt: sent.body.shippedAt, deliveredAt: null });
    expect((await api.get<Fields>('/orders/1')).body.orderStatus).toBe('cancelled');
    const repriced = await api.call<Fields>('PATCH', '/orders/1', { items: [{ productId: 1, quantity: 4 }] });
    expect(repriced.body.itemCount).toBe(4);

    const global = loadOrders(1, 'global').records;
    const other = global.find((o) => o.currency !== global[0]?.currency) as unknown as Fields;
    const moved = await api.call<Failure>('PATCH', '/orders/1?locale=global', { userId: other.userId });
    expect(moved.status).toBe(422);
    expect(moved.body.fields.userId).toContain('This order is in');
    const gone = await api.call<Failure>('PUT', '/orders/2', { userId: 99999, items: [{ productId: 1, quantity: 1 }] });
    expect(gone.body.fields.userId).toBe('No user with id 99999.');
  });
});

describe('references on other writes', () => {
  it('must name records that exist, at the same seed and locale', async () => {
    const api = client(false);
    const bad = await api.call<Failure>('POST', '/comments', {
      postId: 99999,
      userId: 2,
      name: 'Ada',
      email: 'ada@example.com',
      body: 'Hi',
    });
    expect(bad.status).toBe(422);
    expect(bad.body.fields).toEqual({ postId: 'No post with id 99999.' });
    const review = await api.call<Failure>('PATCH', '/reviews/1', { productId: 0 });
    expect(review.status).toBe(422);
    const todo = await api.call<Failure>('PATCH', '/todos/1', { userId: 1001 });
    expect(todo.body.fields).toEqual({ userId: 'No user with id 1001.' });
    expect((await api.call('PATCH', '/todos/1', { completed: true })).status).toBe(200);
  });

  it('see records the session created', async () => {
    const api = client();
    const ada = await api.call<Fields>('POST', '/users', {
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      email: 'ada@example.com',
      avatar: 'https://example.com/ada.png',
      phone: '416-555-0100',
      jobTitle: 'Analyst',
      company: 'Analytical Engines',
      city: 'Toronto',
      country: 'CA',
      active: true,
    });
    expect((await api.get(`/users/${ada.body.id}/orders`)).body.results).toEqual([]);
    const order = await api.call<Fields>('POST', '/orders', {
      userId: ada.body.id,
      items: [{ productId: 2, quantity: 1 }],
    });
    expect(order.status).toBe(201);
    const listed = await api.get(`/users/${ada.body.id}/orders`);
    expect(listed.body.results.map((o) => o.id)).toEqual([order.body.id]);
    const post = await api.call<Fields>('POST', '/posts', {
      userId: ada.body.id,
      title: 'Notes',
      body: 'On the engine.',
    });
    const comment = await api.call<Fields>('POST', '/comments', {
      postId: post.body.id,
      userId: 1,
      name: 'Aaliyah Bosco',
      email: 'aaliyah@example.com',
      body: 'Fascinating.',
    });
    expect(comment.status).toBe(201);
    expect((await api.get(`/posts/${post.body.id}/comments?expand=user,post.user`)).body.results[0]).toMatchObject({
      id: comment.body.id,
      user: { id: 1 },
      post: { id: post.body.id, user: { id: ada.body.id } },
    });
  });
});

describe('deleting with the session on', () => {
  it('takes a user’s orders, posts and their comments, todos, comments and reviews along', async () => {
    const api = client();
    const userId = 2;
    const posts = loadPosts(1, 'en-CA')
      .records.filter((p) => p.userId === userId)
      .map((p) => p.id);
    const counts = async () => ({
      orders: (await api.get(`/orders?userId=${userId}&limit=0`)).body.metadata.total,
      posts: (await api.get(`/posts?userId=${userId}&limit=0`)).body.metadata.total,
      todos: (await api.get(`/todos?userId=${userId}&limit=0`)).body.metadata.total,
      comments: (await api.get(`/comments?userId=${userId}&limit=0`)).body.metadata.total,
      reviews: (await api.get(`/reviews?userId=${userId}&limit=0`)).body.metadata.total,
    });
    const before = await counts();
    expect(before.orders + before.posts + before.todos).toBeGreaterThan(0);
    const commentsOnPosts = loadComments(1, 'en-CA').records.filter((c) => posts.includes(c.postId)).length;
    const totalComments = (await api.get('/comments?limit=0')).body.metadata.total;

    expect((await api.call('DELETE', `/users/${userId}`)).status).toBe(204);
    expect(await counts()).toEqual({ orders: 0, posts: 0, todos: 0, comments: 0, reviews: 0 });
    // Nobody comments on their own post, so the comments on their posts and the comments they wrote are apart.
    expect((await api.get('/comments?limit=0')).body.metadata.total).toBe(
      totalComments - commentsOnPosts - before.comments,
    );
    expect((await api.get(`/users/${userId}/orders`)).status).toBe(404);
    const state = (await api.get<{ datasets: Array<{ dataset: string; deleted: number }> }>('/session')).body;
    expect(state.datasets.find((d) => d.dataset === 'users')?.deleted).toBe(1);
    expect(state.datasets.find((d) => d.dataset === 'orders')?.deleted).toBe(before.orders);

    expect((await api.call<{ reset: number }>('POST', '/reset')).body.reset).toBeGreaterThan(1);
    expect(await counts()).toEqual(before);
  });

  it('takes a product’s reviews, and leaves orders holding what they charged, with expand giving null', async () => {
    const api = client();
    const order = loadOrders(1, 'en-CA').records[0] as {
      id: number;
      items: Array<{ productId: number; name: string }>;
    };
    const productId = order.items[0]?.productId as number;
    const reviews = loadReviews(1, 'en-CA').records.filter((r) => r.productId === productId).length;
    const all = (await api.get('/reviews?limit=0')).body.metadata.total;
    expect((await api.call('DELETE', `/products/${productId}`)).status).toBe(204);
    expect((await api.get('/reviews?limit=0')).body.metadata.total).toBe(all - reviews);
    const kept = (await api.get<Fields & { items: Fields[] }>(`/orders/${order.id}?expand=items.product`)).body;
    expect(kept.items[0]).toMatchObject({ productId, name: order.items[0]?.name, product: null });
  });

  it('takes a post’s comments, and leaves a record created in the session that pointed at it gone too', async () => {
    const api = client();
    const comment = await api.call<Fields>('POST', '/comments', {
      postId: 3,
      userId: 9,
      name: 'Nine',
      email: 'nine@example.com',
      body: 'First!',
    });
    expect((await api.call('DELETE', '/posts/3')).status).toBe(204);
    expect((await api.get(`/comments/${comment.body.id}`)).status).toBe(404);
    expect((await api.get('/comments?postId=3&limit=0')).body.metadata.total).toBe(0);
    expect(loadTodos(1, 'en-CA').records.length).toBeGreaterThan(0);
  });

  it('plans the whole cascade before it changes anything', () => {
    const session = createSession(true);
    const data = new RequestData(resourceNamed, session, 1, 'en-CA', null, 0);
    const users = resourceNamed('users') as (typeof resources)[number];
    const plan = cascade(users, 5, data, resources);
    const names = [...plan.keys()].map((r) => r.name);
    expect(names[0]).toBe('users');
    expect(new Set(names)).toEqual(new Set(['users', ...names.slice(1)]));
    expect(session.summary().datasets).toEqual([]);
  });
});
