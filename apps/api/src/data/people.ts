import type { Faker } from '@faker-js/faker';
import type { Maker } from './build.ts';
import { postalFor } from './postal.ts';

export interface Person {
  index: number;
  name: string;
  /** Japanese records only: the name in katakana. */
  nameKana?: string;
  /** Japanese records only: the name in romaji, family name first. */
  nameRomaji?: string;
  age: number;
  address: string;
  city: string;
  province: string;
  postal: string;
  country: string;
  gender: 'male' | 'female';
}

/**
 * `male` or `female` in every locale, so filters are portable. Faker's own `person.sex()` answers in the
 * locale's language (`männlich`, `女`); `sexType()` draws the same way and always answers in English.
 */
export const genderOf = (faker: Faker) => faker.person.sexType() as Person['gender'];

/** The original `/names` record shape, kept as-is for existing clients; `country` says how to read the address. */
export const makePerson: Maker<Person> = ({ faker, country }, index) => {
  const gender = genderOf(faker);
  const name = faker.person.fullName({ sex: gender });
  const age = faker.number.int({ min: 18, max: 65 });
  const address = faker.location.streetAddress();
  const city = faker.location.city();
  // Drawn in the same order as always, so the seed gives the same people; the code then takes the province's prefix.
  const province = faker.location.state();
  const postal = postalFor(country, province, faker.location.zipCode());
  return {
    index,
    name,
    age,
    address,
    city,
    province,
    postal,
    country,
    gender,
  };
};
