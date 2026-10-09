import type { Faker } from '@faker-js/faker';
import { type CountryLocale, DEFAULT_LOCALE } from '../lib/locale.ts';
import type { Maker } from './build.ts';
import { genderOf } from './people.ts';

export interface User {
  id: number;
  firstName: string;
  lastName: string;
  /** Japanese records only: name readings in katakana. */
  firstNameKana?: string;
  lastNameKana?: string;
  username: string;
  email: string;
  avatar: string;
  phone: string;
  jobTitle: string;
  company: string;
  city: string;
  country: string;
  active: boolean;
  createdAt: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  department: string;
  description: string;
  price: number;
  /** ISO 4217. */
  currency: string;
  rating: number;
  stock: number;
  inStock: boolean;
  createdAt: string;
}

export interface Company {
  id: number;
  name: string;
  industry: string;
  catchPhrase: string;
  website: string;
  email: string;
  phone: string;
  employees: number;
  founded: number;
  city: string;
  province: string;
  country: string;
}

export const ANCHOR = new Date('2026-01-01T00:00:00Z');

/** Drops accents so a login reads `huu.thang.dao` rather than Faker's guess at `Hữu`. `đ` has no decomposition. */
const unaccented = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

/**
 * The names a username and email are built from. Faker spells Han and Hangul out as noise
 * (`3d53fp3i43de3fr3hn`), so those locales get short random handles instead, as many real logins are.
 */
function loginNames({ faker, script }: CountryLocale, firstName: string, lastName: string) {
  if (script === 'han' || script === 'hangul') {
    const handle = () => faker.string.alpha({ length: { min: 3, max: 7 }, casing: 'lower' });
    return { firstName: handle(), lastName: handle() };
  }
  return { firstName: unaccented(firstName), lastName: unaccented(lastName) };
}

export const makeUser: Maker<User> = (locale, i) => {
  const { faker, country } = locale;
  // Names agree with one sex, which Russian surnames show (Корнилов, Корнилова). The default locale keeps
  // the draws it always made, so its users are the same as before.
  const sex = locale.code === DEFAULT_LOCALE ? undefined : genderOf(faker);
  const firstName = faker.person.firstName(sex);
  const lastName = faker.person.lastName(sex);
  const login = loginNames(locale, firstName, lastName);
  return {
    id: i + 1,
    firstName,
    lastName,
    username: faker.internet.username(login).toLowerCase(),
    email: faker.internet.email(login).toLowerCase(),
    avatar: faker.image.avatar(),
    phone: faker.phone.number(),
    jobTitle: faker.person.jobTitle(),
    company: faker.company.name(),
    city: faker.location.city(),
    country,
    active: faker.datatype.boolean({ probability: 0.85 }),
    createdAt: faker.date.past({ years: 3, refDate: ANCHOR }).toISOString(),
  };
};

/** A shelf price in the locale's currency: cents where the currency has them, round hundreds where it is in the thousands. */
function price(faker: Faker, scale: number): number {
  const value = Number(faker.commerce.price({ min: 2 * scale, max: 900 * scale, dec: scale >= 100 ? 0 : 2 }));
  return scale >= 1000 ? Math.max(100, Math.round(value / 100) * 100) : value;
}

export const makeProduct: Maker<Product> = ({ faker, currency, priceScale }, i) => {
  const stock = faker.number.int({ min: 0, max: 250 });
  return {
    id: i + 1,
    sku: faker.string.alphanumeric({ length: 8, casing: 'upper' }),
    name: faker.commerce.productName(),
    department: faker.commerce.department(),
    description: faker.commerce.productDescription(),
    price: price(faker, priceScale),
    currency,
    rating: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
    stock,
    inStock: stock > 0,
    createdAt: faker.date.past({ years: 2, refDate: ANCHOR }).toISOString(),
  };
};

export const makeCompany: Maker<Company> = ({ faker, country }, i) => {
  const name = faker.company.name();
  // Only letters and digits make the domain (`S.A.` would leave dots). A name in Han, Hangul or Cyrillic
  // leaves nothing at all, so the domain gets a word of its own.
  const slug = faker.helpers
    .slugify(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  const domain = `${slug || faker.internet.domainWord()}.example`;
  return {
    id: i + 1,
    name,
    industry: faker.commerce.department(),
    catchPhrase: faker.company.catchPhrase(),
    website: `https://${domain}`,
    email: `hello@${domain}`,
    phone: faker.phone.number(),
    employees: faker.number.int({ min: 2, max: 25_000 }),
    founded: faker.number.int({ min: 1900, max: 2025 }),
    city: faker.location.city(),
    province: faker.location.state(),
    country,
  };
};
