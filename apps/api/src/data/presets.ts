import { fakerEN_CA as faker } from '@faker-js/faker';

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
  currency: 'CAD' | 'JPY';
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
}

const ANCHOR = new Date('2026-01-01T00:00:00Z');

export function generateUsers(count: number, seed: number): User[] {
  faker.seed(seed);
  return Array.from({ length: count }, (_, i) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    return {
      id: i + 1,
      firstName,
      lastName,
      username: faker.internet.username({ firstName, lastName }).toLowerCase(),
      email: faker.internet.email({ firstName, lastName }).toLowerCase(),
      avatar: faker.image.avatar(),
      phone: faker.phone.number(),
      jobTitle: faker.person.jobTitle(),
      company: faker.company.name(),
      city: faker.location.city(),
      country: 'CA',
      active: faker.datatype.boolean({ probability: 0.85 }),
      createdAt: faker.date.past({ years: 3, refDate: ANCHOR }).toISOString(),
    };
  });
}

export function generateProducts(count: number, seed: number): Product[] {
  faker.seed(seed);
  return Array.from({ length: count }, (_, i) => {
    const stock = faker.number.int({ min: 0, max: 250 });
    return {
      id: i + 1,
      sku: faker.string.alphanumeric({ length: 8, casing: 'upper' }),
      name: faker.commerce.productName(),
      department: faker.commerce.department(),
      description: faker.commerce.productDescription(),
      price: Number(faker.commerce.price({ min: 2, max: 900 })),
      currency: 'CAD',
      rating: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
      stock,
      inStock: stock > 0,
      createdAt: faker.date.past({ years: 2, refDate: ANCHOR }).toISOString(),
    };
  });
}

export function generateCompanies(count: number, seed: number): Company[] {
  faker.seed(seed);
  return Array.from({ length: count }, (_, i) => {
    const name = faker.company.name();
    const domain = `${faker.helpers.slugify(name).toLowerCase().replace(/-+/g, '')}.example`;
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
    };
  });
}
