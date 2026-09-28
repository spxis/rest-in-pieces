import { fakerJA as faker } from '@faker-js/faker';
import type { Person } from '../people.ts';
import type { Company, Product, User } from '../presets.ts';
import { CATCH_PHRASES, COMPANY_KINDS, DEPARTMENTS, JOB_TITLES, PRODUCT_NOTES } from './catalog.ts';
import { FAMILY_NAMES, FEMALE_NAMES, type JapaneseName, MALE_NAMES } from './names.ts';
import { PREFECTURES } from './places.ts';

const ANCHOR = new Date('2026-01-01T00:00:00Z');

/** Words companies are often named after besides a family name, with romaji for their domains. */
const COMPANY_STEMS: readonly JapaneseName[] = [
  { kanji: '日本', kana: 'ニホン', romaji: 'Nihon' },
  { kanji: '東洋', kana: 'トウヨウ', romaji: 'Toyo' },
  { kanji: '大和', kana: 'ヤマト', romaji: 'Yamato' },
  { kanji: '富士', kana: 'フジ', romaji: 'Fuji' },
  { kanji: '桜', kana: 'サクラ', romaji: 'Sakura' },
  { kanji: '中央', kana: 'チュウオウ', romaji: 'Chuo' },
  { kanji: '東京', kana: 'トウキョウ', romaji: 'Tokyo' },
  { kanji: '大阪', kana: 'オオサカ', romaji: 'Osaka' },
];

type Gender = 'male' | 'female';

/** Faker's Japanese locale names the sexes in Japanese; records keep the same `male` / `female` codes in every locale. */
const gender = (): Gender => faker.helpers.arrayElement(['male', 'female'] as const);

/** Mobile numbers, the way most people give one: 090-1234-5678. */
const mobile = () => faker.helpers.replaceSymbols(`0${faker.helpers.arrayElement([7, 8, 9])}0-####-####`);

/** Office numbers use the prefecture's area code where it is a well-known one. */
function landline(prefecture: string) {
  if (prefecture === '東京都') return faker.helpers.replaceSymbols('03-####-####');
  if (prefecture === '大阪府') return faker.helpers.replaceSymbols('06-####-####');
  return faker.helpers.replaceSymbols(`0${faker.number.int({ min: 11, max: 99 })}-###-####`);
}

function person(gender: Gender) {
  const family = faker.helpers.arrayElement(FAMILY_NAMES);
  const given = faker.helpers.arrayElement(gender === 'male' ? MALE_NAMES : FEMALE_NAMES);
  return { family, given };
}

/** Where someone lives, weighted by prefecture population so Tokyo turns up far more often than Tottori. */
function place() {
  const prefecture = faker.helpers.weightedArrayElement(PREFECTURES.map((value) => ({ value, weight: value.weight })));
  const [city] = faker.helpers.arrayElement(prefecture.cities);
  return { prefecture: prefecture.name, city };
}

function companyName() {
  const stem = faker.datatype.boolean({ probability: 0.7 })
    ? faker.helpers.arrayElement(FAMILY_NAMES)
    : faker.helpers.arrayElement(COMPANY_STEMS);
  const kind = faker.helpers.arrayElement(COMPANY_KINDS);
  const base = `${stem.kanji}${kind.suffix}`;
  return {
    name: faker.datatype.boolean() ? `株式会社${base}` : `${base}株式会社`,
    domain: `${stem.romaji.toLowerCase()}-${kind.romaji}.example.jp`,
    industry: kind.industry,
  };
}

/** Yen prices the way shops write them: whole hundreds, or just under (1,980円). */
function yen(min: number, max: number): number {
  const hundreds = Math.round(faker.number.int({ min, max }) / 100) * 100;
  return Math.max(faker.datatype.boolean() ? hundreds - 20 : hundreds, 80);
}

export function generatePeopleJa(count: number, seed: number): Person[] {
  faker.seed(seed);
  return Array.from({ length: count }, (_, index) => {
    const sex = gender();
    const { family, given } = person(sex);
    const { prefecture, city } = place();
    return {
      index,
      name: `${family.kanji} ${given.kanji}`,
      nameKana: `${family.kana} ${given.kana}`,
      nameRomaji: `${family.romaji} ${given.romaji}`,
      age: faker.number.int({ min: 18, max: 65 }),
      address: faker.location.streetAddress(),
      city,
      province: prefecture,
      postal: faker.location.zipCode(),
      country: 'JP',
      gender: sex,
    };
  });
}

export function generateUsersJa(count: number, seed: number): User[] {
  faker.seed(seed);
  return Array.from({ length: count }, (_, i) => {
    const sex = gender();
    const { family, given } = person(sex);
    const names = { firstName: given.romaji.toLowerCase(), lastName: family.romaji.toLowerCase() };
    return {
      id: i + 1,
      firstName: given.kanji,
      lastName: family.kanji,
      firstNameKana: given.kana,
      lastNameKana: family.kana,
      username: faker.internet.username(names).toLowerCase(),
      email: faker.internet.email(names).toLowerCase(),
      avatar: faker.image.personPortrait({ sex }),
      phone: mobile(),
      jobTitle: faker.helpers.arrayElement(JOB_TITLES),
      company: companyName().name,
      city: place().city,
      country: 'JP',
      active: faker.datatype.boolean({ probability: 0.85 }),
      createdAt: faker.date.past({ years: 3, refDate: ANCHOR }).toISOString(),
    };
  });
}

export function generateProductsJa(count: number, seed: number): Product[] {
  faker.seed(seed);
  return Array.from({ length: count }, (_, i) => {
    const department = faker.helpers.arrayElement(DEPARTMENTS);
    const name = `${faker.helpers.arrayElement(department.products)}${faker.helpers.arrayElement(department.variants)}`;
    const stock = faker.number.int({ min: 0, max: 250 });
    return {
      id: i + 1,
      sku: faker.string.alphanumeric({ length: 8, casing: 'upper' }),
      name,
      department: department.name,
      description: faker.helpers.arrayElements(PRODUCT_NOTES, 2).join(''),
      price: yen(...department.price),
      currency: 'JPY',
      rating: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
      stock,
      inStock: stock > 0,
      createdAt: faker.date.past({ years: 2, refDate: ANCHOR }).toISOString(),
    };
  });
}

export function generateCompaniesJa(count: number, seed: number): Company[] {
  faker.seed(seed);
  return Array.from({ length: count }, (_, i) => {
    const { name, domain, industry } = companyName();
    const { prefecture, city } = place();
    return {
      id: i + 1,
      name,
      industry,
      catchPhrase: faker.helpers.arrayElement(CATCH_PHRASES),
      website: `https://${domain}`,
      email: `info@${domain}`,
      phone: landline(prefecture),
      employees: faker.number.int({ min: 2, max: 25_000 }),
      founded: faker.number.int({ min: 1900, max: 2025 }),
      city,
      province: prefecture,
    };
  });
}
