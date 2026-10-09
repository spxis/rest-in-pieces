import { MAX_RECORDS } from '../lib/collection.ts';
import type { Locale } from '../lib/locale.ts';
import { build, type Makers } from './build.ts';
import { cached } from './cache.ts';
import { makeCompanyJa, makePersonJa, makeProductJa, makeUserJa } from './ja/generate.ts';
import { makePerson, type Person } from './people.ts';
import { type Company, makeCompany, makeProduct, makeUser, type Product, type User } from './presets.ts';

/** Loads a seeded dataset of `MAX_RECORDS` records through the shared cache, keyed by name, locale and seed. */
export const seededLoader =
  <T extends object>(name: string, makers: Makers<T>) =>
  (seed: number, locale: Locale): { records: T[]; generatedAt: Date } =>
    cached(`${name}:${locale}:${seed}`, () => build(makers, MAX_RECORDS, seed, locale));

export const PEOPLE: Makers<Person> = { default: makePerson, ja: makePersonJa };
export const USERS: Makers<User> = { default: makeUser, ja: makeUserJa };
export const PRODUCTS: Makers<Product> = { default: makeProduct, ja: makeProductJa };
export const COMPANIES: Makers<Company> = { default: makeCompany, ja: makeCompanyJa };

export const loadUsers = seededLoader('users', USERS);
export const loadProducts = seededLoader('products', PRODUCTS);
