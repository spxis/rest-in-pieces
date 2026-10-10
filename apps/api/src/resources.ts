import type { z } from '@hono/zod-openapi';
import { build, type Makers } from './data/build.ts';
import { cached } from './data/cache.ts';
import {
  makeEvent,
  makeInvoice,
  makeJob,
  makeMessage,
  makeNotification,
  makePlace,
  makeTransaction,
} from './data/domains.ts';
import { FHIR_FIELDS, loadConditions, loadEncounters, loadObservations, loadPatients } from './data/fhir.ts';
import {
  type CountryRecord,
  countriesNamed,
  countryRecords,
  findCountry,
  findGrouping,
  findSubdivision,
  findWithdrawn,
  groupingRecords,
  loadCountries,
  loadGroupings,
  loadSubdivisionData,
  subdivisionRecords,
  withdrawnRecords,
} from './data/kuni.ts';
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
import { FhirCondition, FhirEncounter, FhirObservation, FhirPatient } from './fhir.schemas.ts';
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
  Grouping,
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
  Subdivision,
  Todo,
  TodoInput,
  User,
  UserInput,
  WithdrawnCountry,
} from './schemas.ts';

export const DEFAULT_SEED = 1;
export const MAX_SEED = 2 ** 32 - 1;

export interface Resource extends RelatedResource {
  /** Path segment, e.g. `users`. */
  name: string;
  /** Where the routes are mounted when that is not `/{name}`: the withdrawn countries are at `/countries/withdrawn`. */
  mount?: string;
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

const fieldsOf = (schema: z.ZodType): string[] => Object.keys((schema as z.ZodObject).shape);
const COUNTRY_FIELDS = fieldsOf(Country);
const WITHDRAWN_FIELDS = fieldsOf(WithdrawnCountry);
const SUBDIVISION_FIELDS = fieldsOf(Subdivision);
const GROUPING_FIELDS = fieldsOf(Grouping);

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
    relations: { subdivision: { kind: 'region', target: 'subdivisions' } },
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
    relations: { subdivision: { kind: 'region', target: 'subdivisions' } },
    ...seededResource('companies', COMPANIES),
  },
  {
    name: 'countries',
    title: 'Country',
    description:
      "Every country and territory with ISO codes, names in English and Japanese (and the request's `locale`), currencies, languages, calling codes, capital, time zones, top-level domain, population, area, coordinates, land borders, driving side and calendar conventions: real reference data from Kuni (Unicode CLDR, Wikidata, IANA, countries-list), so `seed` has no effect. For compatibility it returns every country as a bare array unless `metadata=true` is given. Its subdivisions are at `/countries/{code}/subdivisions` and its groupings (the EU, the G7) at `/countries/{code}/groupings`; the codes ISO has withdrawn (the Soviet Union, Yugoslavia, Zaire) are at `/countries/withdrawn`.",
    schema: Country,
    idField: 'alpha2',
    idDescription: 'ISO 3166 alpha-2, alpha-3 or numeric code, e.g. `CA`, `CAN` or `124`.',
    seeded: false,
    defaults: { limit: MAX_RECORDS, metadata: false },
    ready: () => loadCountries(),
    load: (_, locale) => ({ records: countryRecords(locale) as object[], generatedAt: STATIC_DATE }),
    fields: () => COUNTRY_FIELDS,
    find: (records, id) => findCountry(records as readonly CountryRecord[], id),
    relations: {
      subdivisions: { kind: 'many', target: 'subdivisions', key: 'country' },
      groupings: { kind: 'many', target: 'groupings', key: 'members' },
    },
  },
  {
    name: 'withdrawn',
    mount: 'countries/withdrawn',
    title: 'Withdrawn country',
    description:
      'The countries ISO 3166-3 lists as withdrawn from ISO 3166-1 — the Soviet Union (`SU`), Yugoslavia (`YU`), Czechoslovakia (`CS`), East Germany (`DD`), Zaire (`ZR`), the Netherlands Antilles (`AN`) and the rest — each with the codes it held, its name in English and Japanese, the years its code was in force and the current countries that came after it (`successors`). Real reference data from Kuni (Wikidata, CC0), so `seed` has no effect. They are never in `/countries`. `/countries/withdrawn/SU` finds one by its four-letter code (`SUHH`), alpha-2, alpha-3 or numeric code; where two held a code (`CS`) it is the one withdrawn last.',
    schema: WithdrawnCountry,
    idField: 'code',
    idDescription:
      'The four-letter ISO 3166-3 code, or the alpha-2, alpha-3 or numeric code a withdrawn country held, e.g. `SUHH` or `SU`.',
    seeded: false,
    defaults: { limit: MAX_RECORDS, metadata: true },
    load: (_, locale) => ({ records: withdrawnRecords(locale) as object[], generatedAt: STATIC_DATE }),
    fields: () => WITHDRAWN_FIELDS,
    find: (records, id) => findWithdrawn(records as never, id),
    relations: { successors: { kind: 'list', target: 'countries', key: 'successors' } },
  },
  {
    name: 'subdivisions',
    title: 'Subdivision',
    description:
      "The states, provinces, prefectures, counties, regions and Länder of 200 countries — 5,050 ISO 3166-2 subdivisions — with their code, kind, level, parent, name in English and Japanese, capital, population, area and coordinates: real reference data from Kuni (Unicode CLDR, Wikidata), so `seed` has no effect. Filter by `country=JP`, `type=prefecture` or `level=1`; `/countries/{code}/subdivisions` lists one country's. The first request for a country loads its data; one without a `country` loads all of them. A record's `province` links here: `expand=subdivision` on `/users` or `/names`.",
    schema: Subdivision,
    idField: 'code',
    idDescription: 'ISO 3166-2 code, e.g. `JP-13` or `CA-ON`.',
    seeded: false,
    defaults: { limit: 10, metadata: true },
    ready: (request) =>
      loadSubdivisionData(
        countriesNamed(
          request?.query?.country,
          request?.query?.code,
          request?.query?.parent,
          request?.id,
          ...(request?.hint ?? []),
        ),
      ),
    load: (_, locale) => ({ records: subdivisionRecords(locale) as object[], generatedAt: STATIC_DATE }),
    fields: () => SUBDIVISION_FIELDS,
    find: (records, id) => findSubdivision(records as never, id),
    relations: {
      country: { kind: 'one', target: 'countries', key: 'country' },
      parent: { kind: 'one', target: 'subdivisions', key: 'parent' },
      children: { kind: 'many', target: 'subdivisions', key: 'parent' },
    },
  },
  {
    name: 'groupings',
    title: 'Grouping',
    description:
      "107 groupings of countries and of the subdivisions inside one: the seven continents, the UN M49 areas, 23 international bodies (the UN, the EU, the euro area, Schengen, NATO, the G7 and G20, ASEAN and more) with the days members joined and left, 16 informal groupings (the Middle East, the Balkans, Scandinavia) each with the definition it follows, and regions inside a country (Japan's 地方, the US Census regions). Real reference data from Kuni, so `seed` has no effect. Filter by `kind=membership` or `members=JP`; `/groupings/{id}/countries` lists a grouping's members and `/countries/{code}/groupings` the groupings a country is in.",
    schema: Grouping,
    idField: 'id',
    idDescription: "The grouping's id, e.g. `eu`, `g7`, `asean` or `jp-kanto`.",
    seeded: false,
    defaults: { limit: 10, metadata: true },
    ready: () => loadGroupings(),
    load: (_, locale) => ({ records: groupingRecords(locale) as object[], generatedAt: STATIC_DATE }),
    fields: () => GROUPING_FIELDS,
    find: (records, id) => findGrouping(records as never, id),
    relations: {
      countries: { kind: 'list', target: 'countries', key: 'members' },
      subdivisions: { kind: 'list', target: 'subdivisions', key: 'members' },
    },
  },
  ...related(),
  ...domains(),
  ...fhir(),
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

/** Where a dataset's routes are mounted: `/users`, and `/countries/withdrawn` for the withdrawn countries. */
export const mountOf = (resource: Pick<Resource, 'name' | 'mount'>): string => `/${resource.mount ?? resource.name}`;

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

/** A FHIR-shaped dataset: its ids are strings, as FHIR's are, and its record is a nested resource. */
function fhirResource(
  name: string,
  title: string,
  description: string,
  schema: z.ZodType,
  load: Resource['load'],
  fields: readonly string[],
): Resource {
  return {
    name,
    title,
    description,
    schema,
    idField: 'id',
    idDescription: `The resource's \`id\`, \`1\` to \`1000\`.`,
    seeded: true,
    defaults: { limit: 10, metadata: true },
    load,
    fields: () => [...fields],
    find: (records, id) => records.find((record) => (record as { id?: string }).id === id),
  };
}

function fhir(): Resource[] {
  const SYNTHETIC_NOTE =
    " Synthetic: every record is invented, none comes from or is de-identified from a real person or record, and the codes are this project's own lists, not SNOMED CT, LOINC, ICD or CPT. For building and testing software only. `GET /fhir/{type}` answers the same data as a FHIR Bundle.";
  return [
    fhirResource(
      'patients',
      'Patient',
      `FHIR R4-shaped Patient resources: a name, a birth date, a gender, an address, contact details that nobody answers (fiction-range phones, example.com emails), and a medical record number. Ages run from newborn to ninety, and a few of the old have died.${SYNTHETIC_NOTE}`,
      FhirPatient,
      loadPatients,
      FHIR_FIELDS.Patient,
    ),
    fhirResource(
      'observations',
      'Observation',
      `FHIR R4-shaped Observation resources for the patients in \`/patients\`: vital signs and a few laboratory values, with UCUM units, a typical reference range and an interpretation. Each is dated after its patient was born and before they died, and the value is plausible for their age. \`status\` is also the simulation parameter, so filter it as \`status[eq]=final\` here or \`status=final\` on \`/fhir/Observation\`.${SYNTHETIC_NOTE}`,
      FhirObservation,
      loadObservations,
      FHIR_FIELDS.Observation,
    ),
    fhirResource(
      'conditions',
      'Condition',
      `FHIR R4-shaped Condition resources for the patients in \`/patients\`: chronic and acute conditions from a hand-made list, each beginning after the patient was old enough for it, ending after it began when it is over.${SYNTHETIC_NOTE}`,
      FhirCondition,
      loadConditions,
      FHIR_FIELDS.Condition,
    ),
    fhirResource(
      'encounters',
      'Encounter',
      `FHIR R4-shaped Encounter resources for the patients in \`/patients\`: visits, admissions and consultations, a finished one ending after it starts, a planned one after 2026-01-01, a cancelled or in-progress one with no end. \`status\` is also the simulation parameter, so filter it as \`status[eq]=finished\` here or \`status=finished\` on \`/fhir/Encounter\`.${SYNTHETIC_NOTE}`,
      FhirEncounter,
      loadEncounters,
      FHIR_FIELDS.Encounter,
    ),
  ];
}
