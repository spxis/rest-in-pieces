import { fakerEN_CA as faker } from '@faker-js/faker';

const generators: Record<string, () => unknown> = {
  'person.fullName': () => faker.person.fullName(),
  'person.firstName': () => faker.person.firstName(),
  'person.lastName': () => faker.person.lastName(),
  'person.jobTitle': () => faker.person.jobTitle(),
  'person.sex': () => faker.person.sex(),
  'internet.email': () => faker.internet.email(),
  'internet.username': () => faker.internet.username(),
  'internet.url': () => faker.internet.url(),
  'internet.ipv4': () => faker.internet.ipv4(),
  'location.streetAddress': () => faker.location.streetAddress(),
  'location.city': () => faker.location.city(),
  'location.state': () => faker.location.state(),
  'location.zipCode': () => faker.location.zipCode(),
  'location.country': () => faker.location.country(),
  'phone.number': () => faker.phone.number(),
  'company.name': () => faker.company.name(),
  'company.catchPhrase': () => faker.company.catchPhrase(),
  'commerce.productName': () => faker.commerce.productName(),
  'commerce.department': () => faker.commerce.department(),
  'commerce.price': () => faker.commerce.price(),
  'date.past': () => faker.date.past().toISOString(),
  'date.recent': () => faker.date.recent().toISOString(),
  'number.int': () => faker.number.int(),
  'number.float': () => faker.number.float(),
  'lorem.sentence': () => faker.lorem.sentence(),
  'lorem.word': () => faker.lorem.word(),
  'lorem.paragraph': () => faker.lorem.paragraph(),
  'string.uuid': () => faker.string.uuid(),
  'color.human': () => faker.color.human(),
  'animal.dog': () => faker.animal.dog(),
  'food.dish': () => faker.food.dish(),
  'finance.amount': () => faker.finance.amount(),
  'vehicle.model': () => faker.vehicle.model(),
};

export const generatorTypes = Object.keys(generators).toSorted();

export function hasGenerator(type: string): boolean {
  return Object.hasOwn(generators, type);
}

export function generateValue(type: string): unknown {
  return generators[type]?.();
}

export function generateRecords(
  fields: Array<{ name: string; type: string }>,
  count: number,
  seed: number,
): Array<Record<string, unknown>> {
  faker.seed(seed);
  return Array.from({ length: count }, () =>
    Object.fromEntries(fields.map(({ name, type }) => [name, generateValue(type)])),
  );
}
