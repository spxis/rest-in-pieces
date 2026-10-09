/**
 * The related datasets: orders with their line items, posts, comments, todos and reviews, each joined to
 * `/users` and `/products` by ids that always resolve.
 *
 * Who owns what comes from `owners.ts`; everything else about a record comes from a stream of its own, keyed
 * by the seed, the dataset and the record's id, and from the seeded users and products it points at. So the
 * same seed always gives the same records, a record never depends on the ones built before it, and the
 * datasets these read (`/users`, `/products`) are not changed by being read.
 */
import { Faker } from '@faker-js/faker';
import { MAX_RECORDS } from '../lib/collection.ts';
import { type CountryLocale, countryLocale, GLOBAL, type Locale } from '../lib/locale.ts';
import { globalLocales } from './build.ts';
import { cached } from './cache.ts';
import { childRange, type OwnedDataset, ownership } from './owners.ts';
import { ANCHOR, type Product, type User } from './presets.ts';
import { mix, type Stream, stream } from './random.ts';
import { loadProducts, loadUsers } from './seeded.ts';
import { commentTextJa, postTextJa, reviewText, TODOS_EN, TODOS_JA } from './text.ts';

export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  productId: number;
  /** The product's name when it was ordered. */
  name: string;
  quantity: number;
  /** The product's price when it was ordered, in the order's currency. */
  unitPrice: number;
  /** `quantity × unitPrice`. */
  lineTotal: number;
}

export interface Order {
  id: number;
  userId: number;
  orderStatus: OrderStatus;
  items: OrderItem[];
  /** Units in the order: the quantities added up. */
  itemCount: number;
  currency: string;
  /** The line totals added up. */
  subtotal: number;
  taxRate: number;
  /** `subtotal × taxRate`, rounded to the currency's smallest unit. */
  tax: number;
  /** `subtotal + tax`. */
  total: number;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface Post {
  id: number;
  userId: number;
  title: string;
  body: string;
  createdAt: string;
}

export interface Comment {
  id: number;
  postId: number;
  userId: number;
  /** The commenter's name, as it was when they commented. */
  name: string;
  /** The commenter's email, as it was when they commented. */
  email: string;
  body: string;
  createdAt: string;
}

export interface Todo {
  id: number;
  userId: number;
  title: string;
  completed: boolean;
  /** A date (`2026-03-14`), or null for a todo with no due date. */
  dueOn: string | null;
  createdAt: string;
}

export interface Review {
  id: number;
  productId: number;
  userId: number;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
}

/** Keys that keep each dataset's streams apart. */
const KEYS = { orders: 11, posts: 12, comments: 13, todos: 14, reviews: 15 } as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const END = ANCHOR.getTime();

/** A moment from `from` to `to`, to the second, never after the anchor all seeded dates come before. */
function between(random: Stream, from: number, to: number): number {
  const high = Math.min(to, END - 1000);
  const low = Math.min(from, high);
  return Math.floor((low + random.next() * (high - low)) / 1000) * 1000;
}

const iso = (time: number) => new Date(time).toISOString();

/** The locale each of a dataset's `count` records was written in: one for a country, the seeded mix for `global`. */
function localesOf(seed: number, locale: Locale): (index: number) => CountryLocale {
  if (locale !== GLOBAL) {
    const info = countryLocale(locale);
    return () => info;
  }
  const chosen = globalLocales(seed, MAX_RECORDS);
  return (index) => chosen[index] as CountryLocale;
}

/** Faker instances of our own for lorem, so the shared ones the other datasets draw from are never touched. */
const textFakers = new Map<string, Faker>();
function textFaker(info: CountryLocale, key: number): Faker {
  let faker = textFakers.get(info.code);
  if (!faker) {
    faker = new Faker({ locale: info.faker.rawDefinitions });
    textFakers.set(info.code, faker);
  }
  faker.seed(key);
  return faker;
}

/** A person's name the way their locale writes it: family name first in Japanese, Chinese and Korean. */
export function displayName(user: Pick<User, 'firstName' | 'lastName'>, info: CountryLocale): string {
  if (info.script === 'japanese') return `${user.lastName} ${user.firstName}`;
  if (info.script === 'han' || info.script === 'hangul') return `${user.lastName}${user.firstName}`;
  return `${user.firstName} ${user.lastName}`;
}

/** Runs `make` for every child of every parent, in id order: child `j` (zero-based) gets id `j + 1`. */
function eachChild<T>(seed: number, dataset: OwnedDataset, make: (id: number, parentId: number) => T): T[] {
  const owned = ownership(seed, dataset);
  const records: T[] = [];
  for (let parent = 1; parent < owned.starts.length; parent++) {
    const range = childRange(owned, parent) as [number, number];
    for (let j = range[0]; j < range[1]; j++) records.push(make(j + 1, parent));
  }
  return records;
}

const time = (value: string) => new Date(value).getTime();

function buildOrders(seed: number, locale: Locale): Order[] {
  const users = loadUsers(seed, locale).records;
  const products = loadProducts(seed, locale).records;
  const localeOf = localesOf(seed, locale);
  // In the mix every product has its own currency, so an order only holds products priced in the buyer's.
  const byCurrency = new Map<string, number[]>();
  products.forEach((product, index) => {
    const list = byCurrency.get(product.currency) ?? [];
    list.push(index);
    byCurrency.set(product.currency, list);
  });
  return eachChild(seed, 'orders', (id, userId) => {
    const random = stream(mix(seed, KEYS.orders, id));
    const user = users[userId - 1] as User;
    const info = localeOf(userId - 1);
    const candidates = byCurrency.get(info.currency) ?? products.map((_, index) => index);
    const decimals = info.priceScale >= 100 ? 0 : 2;
    const unit = 10 ** decimals;
    const chosen = new Set<number>();
    const lines = random.weighted([40, 30, 20, 10]) + 1;
    while (chosen.size < Math.min(lines, candidates.length)) chosen.add(random.pick(candidates));
    const items = [...chosen].map((index): OrderItem => {
      const product = products[index] as Product;
      const quantity = random.weighted([70, 20, 10]) + 1;
      const price = Math.round(product.price * unit);
      return {
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice: price / unit,
        lineTotal: (price * quantity) / unit,
      };
    });
    const subtotal = items.reduce((sum, item) => sum + Math.round(item.lineTotal * unit), 0);
    const tax = Math.round(subtotal * info.taxRate);

    const ordered = between(random, time(user.createdAt), END);
    const age = (END - ordered) / DAY;
    const orderStatus: OrderStatus =
      age < 3
        ? random.pick(['pending', 'paid'] as const)
        : age < 7
          ? random.pick(['paid', 'shipped'] as const)
          : ((['delivered', 'cancelled', 'refunded'] as const)[random.weighted([85, 8, 7])] ?? 'delivered');
    const shipped = ['shipped', 'delivered', 'refunded'].includes(orderStatus)
      ? between(random, ordered + 6 * HOUR, ordered + 48 * HOUR)
      : null;
    const delivered =
      shipped !== null && orderStatus !== 'shipped' ? between(random, shipped + DAY, shipped + 4 * DAY) : null;
    return {
      id,
      userId,
      orderStatus,
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      currency: info.currency,
      subtotal: subtotal / unit,
      taxRate: info.taxRate,
      tax: tax / unit,
      total: (subtotal + tax) / unit,
      createdAt: iso(ordered),
      shippedAt: shipped === null ? null : iso(shipped),
      deliveredAt: delivered === null ? null : iso(delivered),
    };
  });
}

function buildPosts(seed: number, locale: Locale): Post[] {
  const users = loadUsers(seed, locale).records;
  const localeOf = localesOf(seed, locale);
  return eachChild(seed, 'posts', (id, userId) => {
    const random = stream(mix(seed, KEYS.posts, id));
    const info = localeOf(userId - 1);
    const createdAt = iso(between(random, time((users[userId - 1] as User).createdAt), END));
    if (info.script === 'japanese') return { id, userId, ...postTextJa(random), createdAt };
    const faker = textFaker(info, mix(seed, KEYS.posts, id));
    const title = faker.lorem.sentence({ min: 3, max: 7 }).replace(/[.。]$/, '');
    const body = faker.lorem.paragraphs(random.int(1, 3), '\n');
    return { id, userId, title, body, createdAt };
  });
}

function buildComments(seed: number, locale: Locale): Comment[] {
  const users = loadUsers(seed, locale).records;
  const posts = loadPosts(seed, locale).records;
  const localeOf = localesOf(seed, locale);
  const owned = ownership(seed, 'comments');
  const records: Comment[] = [];
  for (const post of posts) {
    const [first, end] = childRange(owned, post.id) as [number, number];
    // A post's comments come after it and after one another, so they are dated together and in order.
    const start = time(post.createdAt);
    const dates = Array.from({ length: end - first }, (_, j) =>
      between(stream(mix(seed, KEYS.comments, first + j + 1, 1)), start + 10 * 60_000, start + 30 * DAY),
    ).sort((a, b) => a - b);
    for (let j = first; j < end; j++) {
      const id = j + 1;
      const random = stream(mix(seed, KEYS.comments, id));
      // Anyone but the author.
      let userId = random.int(1, users.length - 1);
      if (userId >= post.userId) userId++;
      const commenter = users[userId - 1] as User;
      const info = localeOf(userId - 1);
      const body =
        info.script === 'japanese'
          ? commentTextJa(random)
          : textFaker(info, mix(seed, KEYS.comments, id)).lorem.sentences(random.int(1, 3));
      records.push({
        id,
        postId: post.id,
        userId,
        name: displayName(commenter, info),
        email: commenter.email,
        body,
        createdAt: iso(Math.max(dates[j - first] as number, start + 60_000)),
      });
    }
  }
  return records;
}

function buildTodos(seed: number, locale: Locale): Todo[] {
  const users = loadUsers(seed, locale).records;
  const localeOf = localesOf(seed, locale);
  return eachChild(seed, 'todos', (id, userId) => {
    const random = stream(mix(seed, KEYS.todos, id));
    const created = between(random, time((users[userId - 1] as User).createdAt), END);
    const due = random.chance(0.75) ? created + random.int(1, 30) * DAY : null;
    return {
      id,
      userId,
      title: random.pick(localeOf(userId - 1).script === 'japanese' ? TODOS_JA : TODOS_EN),
      completed: random.chance(0.45),
      dueOn: due === null ? null : iso(due).slice(0, 10),
      createdAt: iso(created),
    };
  });
}

function buildReviews(seed: number, locale: Locale): Review[] {
  const users = loadUsers(seed, locale).records;
  const products = loadProducts(seed, locale).records;
  const localeOf = localesOf(seed, locale);
  return eachChild(seed, 'reviews', (id, productId) => {
    const random = stream(mix(seed, KEYS.reviews, id));
    const product = products[productId - 1] as Product;
    const userId = random.int(1, users.length);
    const reviewer = users[userId - 1] as User;
    // Ratings gather around the product's own, so its reviews and its rating tell the same story.
    const rating = Math.min(5, Math.max(1, Math.round(product.rating + (random.next() - 0.5) * 3)));
    const after = Math.max(time(product.createdAt), time(reviewer.createdAt));
    return {
      id,
      productId,
      userId,
      rating,
      ...reviewText(random, rating, localeOf(userId - 1).script === 'japanese'),
      createdAt: iso(between(random, after, END)),
    };
  });
}

const loader =
  <T extends object>(name: OwnedDataset, make: (seed: number, locale: Locale) => T[]) =>
  (seed: number, locale: Locale) =>
    cached<T>(`${name}:${locale}:${seed}`, () => make(seed, locale));

export const loadOrders = loader('orders', buildOrders);
export const loadPosts = loader('posts', buildPosts);
export const loadComments = loader('comments', buildComments);
export const loadTodos = loader('todos', buildTodos);
export const loadReviews = loader('reviews', buildReviews);
