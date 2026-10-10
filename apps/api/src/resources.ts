import type { z } from '@hono/zod-openapi';
import { build, type Makers } from './data/build.ts';
import { cached } from './data/cache.ts';
import { type CountryRecord, countries, findCountry, localizedCountries } from './data/countries.ts';
import {
  makeEvent,
  makeInvoice,
  makeJob,
  makeMessage,
  makeNotification,
  makePlace,
  makeTransaction,
} from './data/domains.ts';
import { loadComments, loadOrders, loadPosts, loadReviews, loadTodos } from './data/related.ts';
import { COMPANIES, PEOPLE, PRODUCTS, seededLoader, USERS } from './data/seeded.ts';
import { logsFor, metricsFor } from './data/series.ts';
import {
  AppNotification,
  CalendarEvent,
  Invoice,
  Job,
  LogLine,
  Message,
  Metric,
  Place,
  Transaction,
} from './domains.schemas.ts';
import { type CollectionDefaults, MAX_RECORDS } from './lib/collection.ts';
import { type Derive, deriveOrder } from './lib/integrity.ts';
import { GLOBAL, LOCALES, type Locale } from './lib/locale.ts';
import type { RelatedResource, Relation } from './lib/relations.ts';
import {
  Comment,
  CommentInput,
  Company,
  CompanyInput,
  Country,
  Order,
  OrderInput,
  Person,
  PersonInput,
  Post,
  PostInput,
  Product,
  ProductInput,
  Review,
  ReviewInput,
  Todo,
  TodoInput,
  User,
  UserInput,
} from './schemas.ts';

export const DEFAULT_SEED = 1;
export const MAX_SEED = 2 ** 32 - 1;

export interface Resource extends RelatedResource {
  /** Path segment, e.g. `users`. */
  name: string;
  /** Singular name used in docs. */
  title: string;
  description: string;
  schema: z.ZodType;
  /**
   * What a client sends to create or replace a record: the record without the fields the server sets.
   * A resource with one takes `POST`, `PUT`, `PATCH` and `DELETE`; one without is read-only.
   */
  input?: z.ZodObject;
  /** The field `/{name}/{id}` looks records up by. */
  idField: string;
  idDescription: string;
  seeded: boolean;
  defaults: CollectionDefaults;
  load(seed: number, locale: Locale): { records: object[]; generatedAt: Date };
  /** The fields a record has in this locale. The mix lists every field any of its locales adds. */
  fields(locale: Locale): string[];
  /** Looks a record up in the dataset `load` returned. */
  find(records: readonly object[], id: string): object | undefined;
  /** Fields that hold another dataset's id, and which dataset: `{ userId: 'users' }`. Writes must name a record that exists. */
  references?: Readonly<Record<string, string>>;
  /** Fills in what the server works out on a write (an order's prices and totals), or says which fields are wrong. */
  derive?: Derive;
}

const STATIC_DATE = new Date('2026-09-27T00:00:00Z');

function seededResource<T extends object>(
  name: string,
  makers: Makers<T>,
): Pick<Resource, 'seeded' | 'load' | 'fields'> {
  // One record is enough to read a locale's fields; it is built outside the cache.
  const keysIn = (locale: Exclude<Locale, typeof GLOBAL>) => Object.keys(build(makers, 1, 1, locale)[0] ?? {});
  return {
    seeded: true,
    load: seededLoader(name, makers),
    fields: (locale) =>
      locale === GLOBAL ? [...new Set(LOCALES.flatMap((info) => keysIn(info.code)))] : keysIn(locale),
  };
}

const byNumericField =
  (field: string) =>
  (records: readonly object[], id: string): object | undefined => {
    if (!/^\d+$/.test(id)) return undefined;
    return records.find((record) => (record as Record<string, unknown>)[field] === Number(id));
  };

export const resources: Resource[] = [
  {
    name: 'names',
    title: 'Person',
    description:
      'People with name, age, address, city, province, postal code, country and gender, written for the chosen `locale`: Canadian by default. The original REST in Pieces dataset; also served at `/random-names`.',
    schema: Person,
    input: PersonInput,
    idField: 'index',
    idDescription: 'Zero-based `index` of the person.',
    defaults: { limit: 10, metadata: true },
    find: byNumericField('index'),
    ...seededResource('names', PEOPLE),
  },
  {
    name: 'users',
    title: 'User',
    description: 'Application users with profile, contact details, avatar and account status.',
    schema: User,
    input: UserInput,
    idField: 'id',
    idDescription: 'One-based `id` of the user.',
    defaults: { limit: 10, metadata: true },
    find: byNumericField('id'),
    relations: {
      orders: { kind: 'many', target: 'orders', key: 'userId' },
      posts: { kind: 'many', target: 'posts', key: 'userId' },
      todos: { kind: 'many', target: 'todos', key: 'userId' },
    },
    ...seededResource('users', USERS),
  },
  {
    name: 'products',
    title: 'Product',
    description:
      "Catalogue products with SKU, department, price in the locale's currency (ISO 4217), rating and stock.",
    schema: Product,
    input: ProductInput,
    idField: 'id',
    idDescription: 'One-based `id` of the product.',
    defaults: { limit: 10, metadata: true },
    find: byNumericField('id'),
    relations: { reviews: { kind: 'many', target: 'reviews', key: 'productId' } },
    ...seededResource('products', PRODUCTS),
  },
  {
    name: 'companies',
    title: 'Company',
    description: 'Companies with industry, website, contact details, size and founding year.',
    schema: Company,
    input: CompanyInput,
    idField: 'id',
    idDescription: 'One-based `id` of the company.',
    defaults: { limit: 10, metadata: true },
    find: byNumericField('id'),
    ...seededResource('companies', COMPANIES),
  },
  {
    name: 'countries',
    title: 'Country',
    description:
      'Every country and territory with ISO codes, currencies, languages and calling codes. Real data, so `seed` has no effect. For compatibility it returns every country as a bare array unless `metadata=true` is given.',
    schema: Country,
    idField: 'alpha2',
    idDescription: 'ISO 3166 alpha-2 or alpha-3 code, e.g. `CA` or `CAN`.',
    seeded: false,
    defaults: { limit: MAX_RECORDS, metadata: false },
    load: (_, locale) => ({ records: localizedCountries(locale) as object[], generatedAt: STATIC_DATE }),
    fields: () => Object.keys(countries[0] ?? {}),
    find: (records, id) => findCountry(records as readonly CountryRecord[], id),
  },
  ...related(),
  ...domains(),
];

/** A related dataset: seeded, keyed by `id`, its fields the same in every locale. */
function relatedResource(
  base: Pick<
    Resource,
    'name' | 'title' | 'description' | 'schema' | 'input' | 'references' | 'relations' | 'derive'
  > & {
    load: Resource['load'];
    owner: string;
  },
): Resource {
  const fields = Object.keys((base.schema as z.ZodObject).shape);
  const { owner, ...rest } = base;
  const keys = Object.keys(base.references ?? {});
  return {
    ...rest,
    idField: 'id',
    idDescription: `One-based \`id\` of the ${base.title.toLowerCase()}.`,
    seeded: true,
    defaults: { limit: 10, metadata: true },
    find: byNumericField('id'),
    fields: () => fields,
    keep: ['id', ...keys],
    owned: { dataset: base.name as never, key: owner },
  };
}

function related(): Resource[] {
  const user: Relation = { kind: 'one', target: 'users', key: 'userId' };
  const product = { kind: 'one', target: 'products', key: 'productId' } as const;
  return [
    relatedResource({
      name: 'orders',
      title: 'Order',
      description:
        "Orders with their line items, each joined to `/users` by `userId` and every item to `/products` by `productId`. Totals add up: each line is `quantity × unitPrice`, `tax` is the subtotal times the buyer's locale's rate, and `total` is the two together, in the locale's currency. Dates follow one another: placed after the buyer joined, shipped after that, delivered after that. `/users/{id}/orders` lists one user's.",
      schema: Order,
      input: OrderInput,
      references: { userId: 'users' },
      relations: { user, items: { kind: 'items', relations: { product } } },
      derive: deriveOrder,
      load: loadOrders,
      owner: 'userId',
    }),
    relatedResource({
      name: 'posts',
      title: 'Post',
      description:
        "Blog posts, joined to `/users` by `userId`: JSONPlaceholder's shape (`userId`, `id`, `title`, `body`) plus `createdAt`. Text is Faker's lorem in the locale's language, and hand-written Japanese for `ja`. `/users/{id}/posts` lists one user's, and `/posts/{id}/comments` a post's comments.",
      schema: Post,
      input: PostInput,
      references: { userId: 'users' },
      relations: { user, comments: { kind: 'many', target: 'comments', key: 'postId' } },
      load: loadPosts,
      owner: 'userId',
    }),
    relatedResource({
      name: 'comments',
      title: 'Comment',
      description:
        "Comments on `/posts`, by `postId`, written by `/users`, by `userId`: JSONPlaceholder's shape (`postId`, `id`, `name`, `email`, `body`) plus `userId` and `createdAt`. Each comes after its post and after the comments before it, and nobody comments on their own post.",
      schema: Comment,
      input: CommentInput,
      references: { postId: 'posts', userId: 'users' },
      relations: { post: { kind: 'one', target: 'posts', key: 'postId' }, user },
      load: loadComments,
      owner: 'postId',
    }),
    relatedResource({
      name: 'todos',
      title: 'Todo',
      description:
        "To-do items, joined to `/users` by `userId`: JSONPlaceholder's shape (`userId`, `id`, `title`, `completed`) plus `dueOn` and `createdAt`. `/users/{id}/todos` lists one user's.",
      schema: Todo,
      input: TodoInput,
      references: { userId: 'users' },
      relations: { user },
      load: loadTodos,
      owner: 'userId',
    }),
    relatedResource({
      name: 'reviews',
      title: 'Review',
      description:
        "Product reviews, joined to `/products` by `productId` and to `/users` by `userId`. Ratings gather around the product's own `rating`, the words match the stars, and each review comes after the product was listed and the reviewer joined. `/products/{id}/reviews` lists one product's.",
      schema: Review,
      input: ReviewInput,
      references: { productId: 'products', userId: 'users' },
      relations: { product, user },
      load: loadReviews,
      owner: 'productId',
    }),
  ];
}

/** Looks a dataset up by name. */
export const resourceNamed = (name: string): Resource | undefined => resources.find((r) => r.name === name);

/** A bundled domain read-only dataset: seeded, keyed by `id`, from Faker in the locale. */
function domainResource<T extends object>(
  name: string,
  title: string,
  description: string,
  schema: z.ZodType,
  make: Makers<T>['default'],
): Resource {
  return {
    name,
    title,
    description,
    schema,
    idField: 'id',
    idDescription: `One-based \`id\` of the ${title.toLowerCase()}.`,
    defaults: { limit: 10, metadata: true },
    find: byNumericField('id'),
    ...seededResource(name, { default: make }),
  };
}

/** A series that is a pure function of the seed and the index: the same in every locale. */
function seriesResource(
  name: string,
  title: string,
  description: string,
  schema: z.ZodType,
  records: (seed: number) => object[],
): Resource {
  const fields = Object.keys((schema as z.ZodObject).shape);
  return {
    name,
    title,
    description,
    schema,
    idField: 'id',
    idDescription: `One-based \`id\` of the ${title.toLowerCase()}, which is also its position in time.`,
    seeded: true,
    defaults: { limit: 10, metadata: true },
    load: (seed) => cached(`${name}:${seed}`, () => records(seed)),
    fields: () => fields,
    find: byNumericField('id'),
  };
}

function domains(): Resource[] {
  return [
    domainResource(
      'invoices',
      'Invoice',
      "Invoices with line items, in the locale's currency. Lines add up (`quantity × unitPrice`, then `subtotal`, `tax` at the locale's headline rate and `total`, exact to the currency's smallest unit), and dates follow one another: issued, due after the terms, paid between issue and a little after the due date. A `sent` invoice is not yet due, an `overdue` one is, a `draft` has no dates, and only a `paid` one has a `paidAt`.",
      Invoice,
      makeInvoice,
    ),
    domainResource(
      'transactions',
      'Transaction',
      "Bank-style transactions in the locale's currency: card payments, transfers, deposits, withdrawals, fees, refunds and interest. `amount` is negative for money out and positive for money in; a transaction posts after it happened, and a pending or declined one has no `postedAt`.",
      Transaction,
      makeTransaction,
    ),
    domainResource(
      'events',
      'Event',
      "Calendar events around 2026-01-01: meetings, conferences, appointments, socials, deadlines and holidays, with an IANA `timeZone` for the locale's country. Every event ends after it starts; an all-day event runs from midnight to midnight, and only meetings recur.",
      CalendarEvent,
      makeEvent,
    ),
    domainResource(
      'messages',
      'Message',
      'Inbox messages between two people. Messages are sent in id order, and a reply (`inReplyTo`) answers a lower id, comes after it and takes its subject with `Re: ` in front. A read message has a `readAt` after it was sent.',
      Message,
      makeMessage,
    ),
    domainResource(
      'notifications',
      'Notification',
      'App notifications addressed to `/users` by `userId`: mentions, comments, follows, orders, billing, security and system notices, each with a title, body, channel and a path on this API it is about. A read one has a `readAt` after it was created.',
      AppNotification,
      makeNotification,
    ),
    domainResource(
      'jobs',
      'Job',
      "Job postings with a yearly salary range in the locale's currency (`salaryMin` below `salaryMax`, higher for senior roles), skills, workplace and status. A posting closes after it was posted: a `closed` or `filled` one closed in the past, an `open` or `paused` one has not yet, and applicants grow with how long it has been open.",
      Job,
      makeJob,
    ),
    domainResource(
      'places',
      'Place',
      "Points of interest in the locale's best-known city, with `latitude`, `longitude` and the same point as a GeoJSON `geometry`. Every place is within 15 km of the city centre, and `distanceKm` says how far, so a list can be sorted nearest first.",
      Place,
      makePlace,
    ),
    seriesResource(
      'metrics',
      'Metric',
      'A server metrics time series, one point every five minutes ending at 2026-01-01: CPU, memory, requests per second, median latency and error rate, with a daily wave, noise and now and then an `incident` where latency and errors jump. Each point is a pure function of the `seed` and its position, so it is the same in every locale and any point can be worked out without the ones before it.',
      Metric,
      metricsFor,
    ),
    seriesResource(
      'logs',
      'Log line',
      'Application log lines about every fifteen seconds, ending at 2026-01-01: a level, a service, a message, a trace id, and for `api` lines a status code and duration. Timestamps always increase, and each line is a pure function of the `seed` and its position, so it is the same in every locale.',
      LogLine,
      logsFor,
    ),
  ];
}
