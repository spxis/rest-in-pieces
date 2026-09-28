import { fakerEN_CA as faker } from '@faker-js/faker';

export interface Person {
  index: number;
  name: string;
  age: number;
  address: string;
  city: string;
  province: string;
  postal: string;
  country: string;
  gender: 'male' | 'female';
}

export const MAX_RECORDS = 1000;
export const DEFAULT_SEED = 1;
const MAX_CACHED_SEEDS = 20;

/** Generates the same people for the same seed, on every machine and every restart. */
export function generatePeople(count: number, seed = DEFAULT_SEED): Person[] {
  faker.seed(seed);
  return Array.from({ length: count }, (_, index) => {
    const gender = faker.person.sex() as Person['gender'];
    return {
      index,
      name: faker.person.fullName({ sex: gender }),
      age: faker.number.int({ min: 18, max: 65 }),
      address: faker.location.streetAddress(),
      city: faker.location.city(),
      province: faker.location.state(),
      postal: faker.location.zipCode(),
      country: 'CA',
      gender,
    };
  });
}

const cache = new Map<number, { people: Person[]; generatedAt: Date }>();

export function getPeople(seed = DEFAULT_SEED) {
  const cached = cache.get(seed);
  if (cached) {
    cache.delete(seed);
    cache.set(seed, cached);
    return cached;
  }

  const generated = { people: generatePeople(MAX_RECORDS, seed), generatedAt: new Date() };
  cache.set(seed, generated);
  if (cache.size > MAX_CACHED_SEEDS) {
    const oldestSeed = cache.keys().next().value;
    if (oldestSeed !== undefined) cache.delete(oldestSeed);
  }
  return generated;
}
