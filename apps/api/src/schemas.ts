import { z } from '@hono/zod-openapi';
import { GLOBAL, GLOBAL_NAME, LOCALES } from './lib/locale.ts';

const param = (description: string, example?: string) =>
  z
    .string()
    .optional()
    .openapi({ description, ...(example === undefined ? {} : { example }) });

/** The `locale` description, written from the one list so the docs never miss a locale. */
export const LOCALE_DOCS =
  `Which country the data is written for: ${LOCALES.map((locale) => `\`${locale.code}\` (${locale.name})`).join(', ')}, ` +
  `or \`${GLOBAL}\` (${GLOBAL_NAME}): every record from a locale chosen by the seed, weighted toward the bigger ` +
  'developer populations, with `country` saying which. `en-CA` is the default. Names, addresses, phone numbers, ' +
  'prices (in the local currency) and country names follow the locale; `ja` adds katakana readings. ' +
  'Field names never change, so `province` and `postal` hold whatever the country uses. `GET /locales` lists them all.';

/** The `messy` description. It carries the nullability note once rather than on every field of every schema. */
export const MESSY_DOCS =
  'Rewrites a share of values into the ones that break layouts and parsers: null and missing keys, empty and ' +
  'whitespace-only strings, very long strings (120 characters, 2,000 for descriptions), emoji, combining marks ' +
  'and zero-width joiners, right-to-left text, leading and trailing whitespace, numbers at the edges (0, ' +
  'negative, very large, many decimals) and dates at the edges (the epoch, the far future, 29 February). ' +
  '`true` rewrites about 15% of values; a number from 0 to 1 sets the share, so `0.5` rewrites half and `1` ' +
  "every one. Which values change comes from `seed` and each record's position, so the same URL returns the " +
  'same mess every time. Values keep their type (a string field holds a string, a number field a number, a ' +
  'date field a date in the same format), but while `messy` is on every field except the id may be null or ' +
  'missing, whatever the schema says.';

/** The `auth` description, shared by every data endpoint. */
export const AUTH_DOCS =
  'Makes this request a protected route, to rehearse sign-in: `required` (or `true`) wants any signed-in ' +
  'account, `editor` the editor or admin role, `admin` the admin role. Without a valid ' +
  '`Authorization: Bearer <accessToken>` from `POST /auth/login` it answers `401` (`missing_token`, ' +
  '`invalid_token` or `token_expired`, with a `WWW-Authenticate` header), and for a role that is not enough ' +
  '`403` (`insufficient_role`). Fake tokens, not security.';

/** The `safe` description, shared by every dataset and `/generate`. */
export const SAFE_DOCS =
  '`true` writes contact details and addresses that cannot reach anybody: emails at `example.com`, `example.org` ' +
  'and `example.net` (RFC 2606), URLs on those domains, phone numbers in the ranges regulators keep for fiction ' +
  '(555-0100 to 555-0199 in Canada and the US, Ofcom, Bundesnetzagentur and ARCEP drama numbers in the UK, Germany ' +
  'and France, and `+1 555-01xx` where a country publishes none), card numbers only from the published test ' +
  'numbers, IP addresses only from 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 and 2001:db8::/32, and every ' +
  "avatar from this API's own `/avatars/{seed}.svg`. Off by default in 2.x, so existing output does not change; " +
  'it becomes the default in 3.0.';

/** The `table` description, for `format=sql`. */
export const TABLE_DOCS =
  "With `format=sql`: the table the `INSERT` statements name. Defaults to the dataset's name. A letter or `_`, " +
  'then letters, digits or `_`, up to 63 characters.';

/** Data endpoints take a token only when `?auth=` asks for one, so the token is optional in the document. */
export const OPTIONAL_BEARER = [{}, { bearerAuth: [] }];

export const AuthError = z
  .object({
    error: z.string().openapi({ example: 'Unauthorized' }),
    code: z
      .enum([
        'missing_token',
        'invalid_token',
        'token_expired',
        'invalid_credentials',
        'account_disabled',
        'insufficient_role',
      ])
      .openapi({ description: 'What went wrong, for a client to branch on.' }),
    message: z.string(),
    required: z
      .string()
      .optional()
      .openapi({ description: 'With `insufficient_role`: the role the request asked for.' }),
    role: z.string().optional().openapi({ description: "With `insufficient_role`: the signed-in account's role." }),
  })
  .openapi('AuthError', {
    example: { error: 'Unauthorized', code: 'token_expired', message: 'The access token has expired.' },
  });

/** The answers `?auth=` adds to a data endpoint. */
export const AuthErrors = {
  401: {
    description: 'With `auth`: no token, a token that is not valid, or one that has expired.',
    content: { 'application/json': { schema: AuthError } },
  },
  403: {
    description: "With `auth=editor` or `auth=admin`: the account's role is not enough.",
    content: { 'application/json': { schema: AuthError } },
  },
};

/**
 * Query parameters shared by every collection. Parsing is deliberately lenient,
 * so they are documented as strings and bad values fall back to defaults.
 */
export const ListQuery = z
  .object({
    limit: param('Records per page, 0 to 1000. Aliases: `size`, `length`, `pageSize`.', '10'),
    offset: param('Records to skip.', '0'),
    page: param('One-based page number in pages of `limit`: `page=3&pageSize=20` is `offset=40&limit=20`.'),
    pageSize: param('Alias of `limit`, for use with `page`.'),
    cursor: param(
      'An opaque cursor from `metadata.nextCursor` or `prevCursor`. Overrides `page` and `offset`; an empty `cursor=` starts on the first page with cursor links. A cursor used with different filters, sort, `q`, `seed`, `locale`, `messy` or `max` returns 400.',
    ),
    max: param(
      'Caps the dataset size to test end-of-data handling. Defaults to every record: 1000, or more after creates with the session on. Alias: `maxRecords`.',
    ),
    sortBy: param('Field to sort by. Append `:numeric` to compare as numbers, e.g. `age:numeric`.'),
    sortDirection: param('`asc` or `desc` (also `reverse`, `rev`, `backwards`, `-1`). Alias: `sortOrder`.'),
    q: param('Case-insensitive text search across every field.'),
    metadata: param('`false` returns the bare array instead of the metadata envelope.'),
    resultsName: param('Renames the results key, e.g. `rows`.'),
    seed: param('Selects a repeatable dataset. The same seed always returns the same records.', '1'),
    locale: param(LOCALE_DOCS),
    messy: param(MESSY_DOCS),
    format: param(
      "`json` (default), `csv`, `yaml`, `xml`, `ndjson` (one record per line) or `sql` (one `INSERT` per record, into `table=`). CSV, NDJSON and SQL hold the page's records without the metadata. The `Accept` header works too (`text/csv`, `application/x-ndjson`, `application/sql`).",
    ),
    delay: param(
      'Wait this many milliseconds before responding, up to 10000. A range such as `200-800` picks a wait inside it from the request, seed included, so the same URL always waits the same time.',
    ),
    trickle: param(
      'Send the headers at once and the body in pieces this many milliseconds apart, whatever the format. With `delay`, the whole response takes no more than 10000 ms.',
    ),
    status: param('Respond with this status (200–599). 4xx and 5xx return a simulated error.'),
    fail: param('`true` fails the request; a fraction such as `0.2` fails that share of requests.'),
    auth: param(AUTH_DOCS),
  })
  .catchall(z.string().optional());

export const FILTER_DOCS =
  'Any other parameter that names a field filters the results: `gender=female`, `province=Ontario,Quebec`, ' +
  'or ranges with `age[gte]=30&age[lt]=40` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`).';

export const ErrorBody = z.object({ error: z.string().openapi({ example: 'Not Found' }) }).openapi('Error');

export const PageLinks = z
  .object({
    self: z.string(),
    first: z.string(),
    last: z.string(),
    prev: z.string().nullable(),
    next: z.string().nullable(),
  })
  .openapi('PageLinks');

export const Metadata = z
  .object({
    count: z.number().int().openapi({ description: 'Records in this page.' }),
    total: z.number().int().openapi({ description: 'Records in the dataset after filtering and `max`.' }),
    timestamp: z.string().openapi({ description: 'When the dataset was generated, in epoch milliseconds.' }),
    lastUpdated: z.string().openapi({ description: 'When the dataset was generated, as ISO 8601.' }),
    output: z.object({ results: z.string() }),
    version: z.string(),
    parameters: z.record(z.string(), z.unknown()),
    links: PageLinks,
    nextCursor: z.string().nullable().openapi({ description: 'Cursor for the next page, or null on the last page.' }),
    prevCursor: z
      .string()
      .nullable()
      .openapi({ description: 'Cursor for the previous page, or null on the first page.' }),
  })
  .openapi('Metadata');

export const Person = z
  .object({
    index: z.number().int(),
    name: z.string(),
    nameKana: z.string().optional().openapi({ description: 'Japanese records only: the name in katakana.' }),
    nameRomaji: z
      .string()
      .optional()
      .openapi({ description: 'Japanese records only: the name in romaji, family name first.' }),
    age: z.number().int(),
    address: z.string(),
    city: z.string(),
    province: z.string(),
    postal: z.string(),
    country: z.string().openapi({ description: 'ISO 3166-1 alpha-2 code of the locale the record was written for.' }),
    gender: z.enum(['male', 'female']),
  })
  .openapi('Person', {
    example: {
      index: 0,
      name: 'Aaliyah Corkery',
      age: 26,
      address: '4546 Marcos Junction',
      city: 'Pearlworth',
      province: 'Newfoundland and Labrador',
      postal: 'A8M 8G0',
      country: 'CA',
      gender: 'female',
    },
  });

export const User = z
  .object({
    id: z.number().int(),
    firstName: z.string(),
    lastName: z.string(),
    firstNameKana: z.string().optional().openapi({ description: 'Japanese records only: katakana reading.' }),
    lastNameKana: z.string().optional().openapi({ description: 'Japanese records only: katakana reading.' }),
    username: z.string(),
    email: z.string(),
    avatar: z.string().url(),
    phone: z.string(),
    jobTitle: z.string(),
    company: z.string(),
    city: z.string(),
    country: z.string().openapi({ description: 'ISO 3166-1 alpha-2 code of the locale the record was written for.' }),
    active: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .openapi('User');

export const Product = z
  .object({
    id: z.number().int(),
    sku: z.string(),
    name: z.string(),
    department: z.string(),
    description: z.string(),
    price: z.number(),
    currency: z.string().openapi({ description: "ISO 4217 code of the locale's currency.", example: 'CAD' }),
    rating: z.number(),
    stock: z.number().int(),
    inStock: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .openapi('Product');

export const Company = z
  .object({
    id: z.number().int(),
    name: z.string(),
    industry: z.string(),
    catchPhrase: z.string(),
    website: z.string().url(),
    email: z.string(),
    phone: z.string(),
    employees: z.number().int(),
    founded: z.number().int(),
    city: z.string(),
    province: z.string(),
    country: z.string().openapi({ description: 'ISO 3166-1 alpha-2 code of the locale the record was written for.' }),
  })
  .openapi('Company');

const Point = z
  .object({ lat: z.number(), lon: z.number() })
  .openapi('GeoPoint', { example: { lat: 35.6895, lon: 139.6917 } });

export const Country = z
  .object({
    alpha2: z.string().openapi({ description: 'ISO 3166-1 alpha-2 code.', example: 'JP' }),
    alpha3: z
      .string()
      .openapi({ description: 'ISO 3166-1 alpha-3 code; empty for Kosovo, which has none.', example: 'JPN' }),
    name: z.string().openapi({
      description:
        "The country's name in the request's `locale`: Kuni's English or Japanese, the runtime's CLDR for the other languages.",
      example: 'Japan',
    }),
    status: z.string().openapi({
      description:
        '`assigned` for an ISO 3166-1 code and `user assigned` for Kosovo (XK). The withdrawn codes (`deleted`) are at `/countries/withdrawn`.',
    }),
    ioc: z.string().openapi({
      description: "The Olympic committee's code (`GER` for Germany); empty where there is none.",
      example: 'JPN',
    }),
    emoji: z.string().openapi({ description: 'The flag emoji; empty for Kosovo.', example: '🇯🇵' }),
    currencies: z.array(z.string()).openapi({ description: 'ISO 4217 codes in use now.', example: ['JPY'] }),
    languages: z
      .array(z.string())
      .openapi({ description: 'ISO 639-2/T language codes, most used first.', example: ['jpn'] }),
    countryCallingCodes: z.array(z.string()).openapi({ example: ['+81'] }),
    numeric: z.string().openapi({ description: 'ISO 3166-1 numeric code, three digits.', example: '392' }),
    names: z
      .object({ en: z.string(), ja: z.string(), native: z.string().nullable() })
      .openapi({ description: "The name in English, Japanese and the country's own language." }),
    shortName: z
      .object({ en: z.string().nullable(), ja: z.string().nullable() })
      .openapi({ description: 'CLDR\'s short form: "US" and アメリカ for the United States.' }),
    reading: z
      .string()
      .nullable()
      .openapi({ description: 'The Japanese name in hiragana, where it is written with kanji.', example: 'にほん' }),
    aliases: z.array(z.string()).openapi({ description: 'Other names people type: Holland, UK, 米国.' }),
    continent: z.string().openapi({ description: 'AF, AN, AS, EU, NA, OC or SA, from UN M49.', example: 'AS' }),
    subregion: z.string().nullable().openapi({ description: 'The UN M49 subregion code.', example: '030' }),
    callingCode: z.string().nullable().openapi({ description: 'The ITU country calling code.', example: '+81' }),
    tld: z
      .string()
      .nullable()
      .openapi({ description: 'The country-code top-level domain, without its dot.', example: 'jp' }),
    capital: z.object({ en: z.string(), ja: z.string() }).nullable(),
    timeZones: z.array(z.string()).openapi({ description: 'IANA time zones.', example: ['Asia/Tokyo'] }),
    subdivisionType: z
      .string()
      .nullable()
      .openapi({ description: 'What most of its first-level subdivisions are called.', example: 'prefecture' }),
    population: z.number().nullable(),
    populationYear: z.number().nullable(),
    areaKm2: z.number().nullable(),
    areaYear: z.number().nullable(),
    location: Point.nullable().openapi({ description: "Wikidata's point for the whole country." }),
    capitalLocation: Point.nullable(),
    borders: z
      .array(z.string())
      .openapi({ description: 'Alpha-2 codes of the countries it shares a land border with.' }),
    drivingSide: z.string().nullable().openapi({ description: '`left` or `right`.' }),
    weekStart: z.string().openapi({ description: 'The first day of the week (CLDR): `mon`, `sun`, `sat` or `fri`.' }),
    measurement: z.string().openapi({ description: '`metric`, `US` or `UK`.' }),
    paper: z.string().openapi({ description: '`A4` or `US-Letter`.' }),
    hourCycle: z.string().openapi({ description: '`h23` or `h12`.' }),
  })
  .openapi('Country');

export const WithdrawnCountry = z
  .object({
    code: z.string().openapi({ description: 'The four-letter ISO 3166-3 code.', example: 'SUHH' }),
    alpha2: z
      .string()
      .openapi({ description: 'The alpha-2 code it held; the first two letters of `code`.', example: 'SU' }),
    alpha3: z.string().nullable().openapi({ example: 'SUN' }),
    numeric: z.string().nullable().openapi({ example: '810' }),
    name: z.string().openapi({
      description: "Its name in the request's `locale`: Japanese for `ja`, English otherwise.",
      example: 'Soviet Union',
    }),
    names: z.object({ en: z.string(), ja: z.string().nullable() }),
    status: z.string().openapi({ description: 'Always `deleted`, as the old country list called it.' }),
    since: z.string().openapi({
      description: 'The year its code came into force (a full day where Wikidata gives one).',
      example: '1974',
    }),
    until: z.string().openapi({ description: 'The year its code was withdrawn.', example: '1992' }),
    successors: z
      .array(z.string())
      .openapi({ description: 'Alpha-2 codes of the current countries that came after it.' }),
    reusedBy: z
      .string()
      .nullable()
      .openapi({ description: 'Set when a current country now holds the alpha-2 code (BY, AI, BQ, GE, SK).' }),
  })
  .openapi('WithdrawnCountry');

export const GeneratedRecord = z
  .object({ index: z.number().int() })
  .catchall(z.unknown())
  .openapi('GeneratedRecord', { example: { index: 0, name: 'Aaliyah Corkery', email: 'aaliyah@example.com' } });

/** A list response: the metadata envelope by default, or a bare array with `metadata=false`. */
export function listOf<T extends z.ZodType>(item: T, name: string) {
  return z.union([z.object({ metadata: Metadata, results: z.array(item) }), z.array(item)]).openapi(`${name}List`);
}

export const TEXT_FORMATS = {
  'text/csv': { schema: z.string() },
  'application/yaml': { schema: z.string() },
  'application/xml': { schema: z.string() },
  'application/x-ndjson': { schema: z.string() },
  'application/sql': { schema: z.string() },
};

/** A write whose body did not validate: one message per field, keyed by its dotted path. */
export const ValidationErrorBody = z
  .object({
    error: z.literal('Validation failed'),
    fields: z.record(z.string(), z.string()).openapi({
      description: 'One message per field that failed, keyed by its path (`address.city` for a nested one).',
    }),
  })
  .openapi('ValidationError', { example: { error: 'Validation failed', fields: { email: 'Invalid email' } } });

/*
 * What a client sends to create or replace a record: the record without the fields the server sets
 * (the id and `createdAt`), with the checks a real backend would make on a form.
 */
const text = () => z.string().trim().min(1, 'Required');
const email = () => z.email('Invalid email');
const url = () => z.url('Invalid URL');

export const PersonInput = Person.omit({ index: true })
  .extend({
    name: text(),
    age: z.number().int().min(0).max(130),
    address: text(),
    city: text(),
    province: text(),
    postal: text(),
    country: text(),
  })
  .openapi('PersonInput');

export const UserInput = User.omit({ id: true, createdAt: true })
  .extend({
    firstName: text(),
    lastName: text(),
    username: text(),
    email: email(),
    avatar: url(),
    country: text(),
  })
  .openapi('UserInput');

export const ProductInput = Product.omit({ id: true, createdAt: true })
  .extend({
    sku: text(),
    name: text(),
    price: z.number().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code such as CAD'),
    rating: z.number().min(0).max(5),
    stock: z.number().int().nonnegative(),
  })
  .openapi('ProductInput');

export const CompanyInput = Company.omit({ id: true })
  .extend({
    name: text(),
    website: url(),
    email: email(),
    employees: z.number().int().positive(),
    founded: z.number().int().min(1600).max(2100),
    country: text(),
  })
  .openapi('CompanyInput');

const id = (description: string) => z.number().int().positive().openapi({ description });
const iso = (description: string) => z.string().datetime().openapi({ description });

export const OrderItem = z
  .object({
    productId: id('The product in `/products`, at the same `seed` and `locale`.'),
    name: z.string().openapi({ description: "The product's name when it was ordered." }),
    quantity: z.number().int().positive(),
    unitPrice: z.number().openapi({ description: "The product's price when it was ordered, in the order's currency." }),
    lineTotal: z.number().openapi({ description: '`quantity × unitPrice`.' }),
  })
  .openapi('OrderItem');

export const ORDER_STATUS_VALUES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'] as const;

export const Order = z
  .object({
    id: z.number().int(),
    userId: id('The buyer in `/users`.'),
    orderStatus: z.enum(ORDER_STATUS_VALUES).openapi({
      description:
        'Named `orderStatus` because `status` is the simulation parameter. `shipped` orders have `shippedAt`; `delivered` and `refunded` ones `deliveredAt` too.',
    }),
    items: z.array(OrderItem),
    itemCount: z.number().int().openapi({ description: 'Units in the order: the quantities added up.' }),
    currency: z.string().openapi({ description: "ISO 4217: the buyer's locale's currency.", example: 'CAD' }),
    subtotal: z.number().openapi({ description: 'The line totals added up.' }),
    taxRate: z.number().openapi({ description: "The buyer's locale's headline sales tax or VAT rate.", example: 0.13 }),
    tax: z.number().openapi({ description: "`subtotal × taxRate`, rounded to the currency's smallest unit." }),
    total: z.number().openapi({ description: '`subtotal + tax`.' }),
    createdAt: iso('When the order was placed: after the buyer joined.'),
    shippedAt: z.string().datetime().nullable().openapi({ description: 'After `createdAt`; null until shipped.' }),
    deliveredAt: z.string().datetime().nullable().openapi({ description: 'After `shippedAt`; null until delivered.' }),
  })
  .openapi('Order');

export const Post = z
  .object({
    id: z.number().int(),
    userId: id('The author in `/users`.'),
    title: z.string(),
    body: z.string(),
    createdAt: iso('After the author joined.'),
  })
  .openapi('Post');

export const Comment = z
  .object({
    id: z.number().int(),
    postId: id('The post in `/posts`.'),
    userId: id('The commenter in `/users`: never the post’s author.'),
    name: z.string().openapi({ description: "The commenter's name, as it was when they commented." }),
    email: z.string().openapi({ description: "The commenter's email, as it was when they commented." }),
    body: z.string(),
    createdAt: iso('After the post, and after the comments before it.'),
  })
  .openapi('Comment');

export const Todo = z
  .object({
    id: z.number().int(),
    userId: id('The owner in `/users`.'),
    title: z.string(),
    completed: z.boolean(),
    dueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .openapi({ description: 'A date after `createdAt`, or null.', example: '2025-06-30' }),
    createdAt: iso('After the owner joined.'),
  })
  .openapi('Todo');

export const Review = z
  .object({
    id: z.number().int(),
    productId: id('The product in `/products`.'),
    userId: id('The reviewer in `/users`.'),
    rating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .openapi({ description: "1 to 5, gathered around the product's own rating." }),
    title: z.string(),
    body: z.string(),
    createdAt: iso('After the product was listed and the reviewer joined.'),
  })
  .openapi('Review');

const ref = () => z.number({ error: 'Required' }).int('Use a whole number').positive('Use an id of 1 or more');

export const OrderInput = z
  .object({
    userId: ref(),
    items: z
      .array(z.object({ productId: ref(), quantity: z.number().int().min(1).max(99) }))
      .min(1, 'An order needs at least one item')
      .max(20, 'An order takes at most 20 items'),
    orderStatus: z.enum(ORDER_STATUS_VALUES).optional().openapi({ description: 'Defaults to `pending`.' }),
  })
  .openapi('OrderInput', {
    description:
      "The buyer and what they bought. The server fills in each item's name and price from `/products`, the totals and tax from the buyer's locale, and the dates.",
  });

export const PostInput = z.object({ userId: ref(), title: text(), body: text() }).openapi('PostInput');

export const CommentInput = z
  .object({ postId: ref(), userId: ref(), name: text(), email: email(), body: text() })
  .openapi('CommentInput');

export const TodoInput = z
  .object({
    userId: ref(),
    title: text(),
    completed: z.boolean().optional().openapi({ description: 'Defaults to `false`.' }),
    dueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date such as 2026-03-14')
      .nullable()
      .optional(),
  })
  .openapi('TodoInput');

export const ReviewInput = z
  .object({ productId: ref(), userId: ref(), rating: z.number().int().min(1).max(5), title: text(), body: text() })
  .openapi('ReviewInput');
