import type { z } from '@hono/zod-openapi';
import { cached } from './data/cache.ts';
import { countries, findCountry } from './data/countries.ts';
import { generatePeople } from './data/people.ts';
import { generateCompanies, generateProducts, generateUsers } from './data/presets.ts';
import { type CollectionDefaults, MAX_RECORDS } from './lib/collection.ts';
import { Company, Country, Person, Product, User } from './schemas.ts';

export const DEFAULT_SEED = 1;
export const MAX_SEED = 2 ** 32 - 1;

export interface Resource {
  /** Path segment, e.g. `users`. */
  name: string;
  /** Singular name used in docs. */
  title: string;
  description: string;
  schema: z.ZodType;
  /** The field `/{name}/{id}` looks records up by. */
  idField: string;
  idDescription: string;
  seeded: boolean;
  defaults: CollectionDefaults;
  load(seed: number): { records: object[]; generatedAt: Date };
  find(records: readonly object[], id: string): object | undefined;
}

const STATIC_DATE = new Date('2026-09-27T00:00:00Z');

function seededResource(
  name: string,
  generate: (count: number, seed: number) => object[],
): Pick<Resource, 'seeded' | 'load'> {
  return { seeded: true, load: (seed) => cached(`${name}:${seed}`, () => generate(MAX_RECORDS, seed)) };
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
      'Canadian people with name, age, address, city, province, postal code and gender. The original REST in Pieces dataset; also served at `/random-names`.',
    schema: Person,
    idField: 'index',
    idDescription: 'Zero-based `index` of the person.',
    defaults: { limit: 10, metadata: true },
    find: byNumericField('index'),
    ...seededResource('names', generatePeople),
  },
  {
    name: 'users',
    title: 'User',
    description: 'Application users with profile, contact details, avatar and account status.',
    schema: User,
    idField: 'id',
    idDescription: 'One-based `id` of the user.',
    defaults: { limit: 10, metadata: true },
    find: byNumericField('id'),
    ...seededResource('users', generateUsers),
  },
  {
    name: 'products',
    title: 'Product',
    description: 'Catalogue products with SKU, department, price, rating and stock.',
    schema: Product,
    idField: 'id',
    idDescription: 'One-based `id` of the product.',
    defaults: { limit: 10, metadata: true },
    find: byNumericField('id'),
    ...seededResource('products', generateProducts),
  },
  {
    name: 'companies',
    title: 'Company',
    description: 'Companies with industry, website, contact details, size and founding year.',
    schema: Company,
    idField: 'id',
    idDescription: 'One-based `id` of the company.',
    defaults: { limit: 10, metadata: true },
    find: byNumericField('id'),
    ...seededResource('companies', generateCompanies),
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
    load: () => ({ records: countries as object[], generatedAt: STATIC_DATE }),
    find: (_, id) => findCountry(id),
  },
];
