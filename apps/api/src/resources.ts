import type { z } from '@hono/zod-openapi';
import { build, type Makers } from './data/build.ts';
import { cached } from './data/cache.ts';
import { type CountryRecord, countries, findCountry, localizedCountries } from './data/countries.ts';
import { makeCompanyJa, makePersonJa, makeProductJa, makeUserJa } from './data/ja/generate.ts';
import { makePerson } from './data/people.ts';
import { makeCompany, makeProduct, makeUser } from './data/presets.ts';
import { type CollectionDefaults, MAX_RECORDS } from './lib/collection.ts';
import { GLOBAL, LOCALES, type Locale } from './lib/locale.ts';
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
  load(seed: number, locale: Locale): { records: object[]; generatedAt: Date };
  /** The fields a record has in this locale. The mix lists every field any of its locales adds. */
  fields(locale: Locale): string[];
  /** Looks a record up in the dataset `load` returned. */
  find(records: readonly object[], id: string): object | undefined;
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
    load: (seed, locale) => cached(`${name}:${locale}:${seed}`, () => build(makers, MAX_RECORDS, seed, locale)),
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
    idField: 'index',
    idDescription: 'Zero-based `index` of the person.',
    defaults: { limit: 10, metadata: true },
    find: byNumericField('index'),
    ...seededResource('names', { default: makePerson, ja: makePersonJa }),
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
    ...seededResource('users', { default: makeUser, ja: makeUserJa }),
  },
  {
    name: 'products',
    title: 'Product',
    description:
      "Catalogue products with SKU, department, price in the locale's currency (ISO 4217), rating and stock.",
    schema: Product,
    idField: 'id',
    idDescription: 'One-based `id` of the product.',
    defaults: { limit: 10, metadata: true },
    find: byNumericField('id'),
    ...seededResource('products', { default: makeProduct, ja: makeProductJa }),
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
    ...seededResource('companies', { default: makeCompany, ja: makeCompanyJa }),
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
];
