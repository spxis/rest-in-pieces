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

/** The original `/names` record shape, kept as-is for existing clients. */
export function generatePeople(count: number, seed: number): Person[] {
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
