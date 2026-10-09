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
      'An opaque cursor from `metadata.nextCursor` or `prevCursor`. Overrides `page` and `offset`; an empty `cursor=` starts on the first page with cursor links. A cursor used with different filters, sort, `q`, `seed`, `locale` or `max` returns 400.',
    ),
    max: param('Caps the dataset size to test end-of-data handling. Alias: `maxRecords`.'),
    sortBy: param('Field to sort by. Append `:numeric` to compare as numbers, e.g. `age:numeric`.'),
    sortDirection: param('`asc` or `desc` (also `reverse`, `rev`, `backwards`, `-1`). Alias: `sortOrder`.'),
    q: param('Case-insensitive text search across every field.'),
    metadata: param('`false` returns the bare array instead of the metadata envelope.'),
    resultsName: param('Renames the results key, e.g. `rows`.'),
    seed: param('Selects a repeatable dataset. The same seed always returns the same records.', '1'),
    locale: param(LOCALE_DOCS),
    format: param('`json` (default), `csv`, `yaml` or `xml`. The `Accept` header works too.'),
    delay: param(
      'Wait this many milliseconds before responding, up to 10000. A range such as `200-800` picks a wait inside it from the request, seed included, so the same URL always waits the same time.',
    ),
    trickle: param(
      'Send the headers at once and the body in pieces this many milliseconds apart, whatever the format. With `delay`, the whole response takes no more than 10000 ms.',
    ),
    status: param('Respond with this status (200–599). 4xx and 5xx return a simulated error.'),
    fail: param('`true` fails the request; a fraction such as `0.2` fails that share of requests.'),
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
      postal: 'R8M 8G0',
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

export const Country = z
  .object({
    alpha2: z.string(),
    alpha3: z.string(),
    name: z.string(),
    status: z.string(),
    ioc: z.string(),
    emoji: z.string(),
    currencies: z.array(z.string()),
    languages: z.array(z.string()),
    countryCallingCodes: z.array(z.string()),
  })
  .openapi('Country');

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
};
