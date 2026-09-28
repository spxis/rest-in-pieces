import { z } from '@hono/zod-openapi';

const param = (description: string, example?: string) =>
  z
    .string()
    .optional()
    .openapi({ description, ...(example === undefined ? {} : { example }) });

/**
 * Query parameters shared by every collection. Parsing is deliberately lenient,
 * so they are documented as strings and bad values fall back to defaults.
 */
export const ListQuery = z
  .object({
    limit: param('Records per page, 0 to 1000. Aliases: `size`, `length`.', '10'),
    offset: param('Records to skip.', '0'),
    max: param('Caps the dataset size to test end-of-data handling. Alias: `maxRecords`.'),
    sortBy: param('Field to sort by. Append `:numeric` to compare as numbers, e.g. `age:numeric`.'),
    sortDirection: param('`asc` or `desc` (also `reverse`, `rev`, `backwards`, `-1`). Alias: `sortOrder`.'),
    q: param('Case-insensitive text search across every field.'),
    metadata: param('`false` returns the bare array instead of the metadata envelope.'),
    resultsName: param('Renames the results key, e.g. `rows`.'),
    seed: param('Selects a repeatable dataset. The same seed always returns the same records.', '1'),
    format: param('`json` (default), `csv`, `yaml` or `xml`. The `Accept` header works too.'),
    delay: param('Wait this many milliseconds before responding, up to 10000.'),
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
  })
  .openapi('Metadata');

export const Person = z
  .object({
    index: z.number().int(),
    name: z.string(),
    age: z.number().int(),
    address: z.string(),
    city: z.string(),
    province: z.string(),
    postal: z.string(),
    country: z.string(),
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
    username: z.string(),
    email: z.string(),
    avatar: z.string().url(),
    phone: z.string(),
    jobTitle: z.string(),
    company: z.string(),
    city: z.string(),
    country: z.string(),
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
    currency: z.literal('CAD'),
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
