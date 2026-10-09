import { fakerJA as faker } from '@faker-js/faker';
import type { Maker } from '../build.ts';
import type { Person } from '../people.ts';
import { ANCHOR, type Company, type Product, type User } from '../presets.ts';
import { CATCH_PHRASES, COMPANY_KINDS, DEPARTMENTS, JOB_TITLES } from './catalog.ts';
import { FAMILY_NAMES, FEMALE_NAMES, type JapaneseName, MALE_NAMES } from './names.ts';
import { PREFECTURES } from './places.ts';

/**
 * Words companies are often named after besides a family name, with romaji for their domains.
 * Stems such as 日本, 富士 or 東洋 are left out because they combine into the names of real listed companies.
 */
const COMPANY_STEMS: readonly JapaneseName[] = [
  { kanji: '旭', kana: 'アサヒ', romaji: 'Asahi' },
  { kanji: '三和', kana: 'サンワ', romaji: 'Sanwa' },
  { kanji: '北斗', kana: 'ホクト', romaji: 'Hokuto' },
  { kanji: '明和', kana: 'メイワ', romaji: 'Meiwa' },
  { kanji: '常盤', kana: 'トキワ', romaji: 'Tokiwa' },
  { kanji: '桜', kana: 'サクラ', romaji: 'Sakura' },
  { kanji: '中央', kana: 'チュウオウ', romaji: 'Chuo' },
];

/** Area codes of the larger cities. Elsewhere a plausible code is made up. */
const AREA_CODES: Record<string, string> = {
  札幌市: '011',
  仙台市: '022',
  さいたま市: '048',
  千葉市: '043',
  新宿区: '03',
  渋谷区: '03',
  世田谷区: '03',
  品川区: '03',
  横浜市: '045',
  川崎市: '044',
  名古屋市: '052',
  京都市: '075',
  大阪市: '06',
  神戸市: '078',
  広島市: '082',
  福岡市: '092',
};

/** 020, 050, 060, 070, 080 and 090 are mobile, IP-phone or unassigned prefixes, never a town. */
const NOT_AREA = new Set([20, 50, 60, 70, 80, 90]);

type Gender = 'male' | 'female';

/** Faker's Japanese locale names the sexes in Japanese; records keep the same `male` / `female` codes in every locale. */
const gender = (): Gender => faker.helpers.arrayElement(['male', 'female'] as const);

/** Mobile numbers, the way most people give one: 090-1234-5678. */
const mobile = () => faker.helpers.replaceSymbols(`0${faker.helpers.arrayElement([7, 8, 9])}0-####-####`);

/** Office numbers: 10 digits in all, with the city's real area code where it is a well-known one. */
function landline(city: string) {
  const known = AREA_CODES[city];
  if (known) return faker.helpers.replaceSymbols(`${known}-${'#'.repeat(6 - known.length)}-####`);
  const codes = Array.from({ length: 89 }, (_, i) => i + 11).filter((code) => !NOT_AREA.has(code));
  return faker.helpers.replaceSymbols(`0${faker.helpers.arrayElement(codes)}-###-####`);
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

/*
 * The makers below draw from the module's `fakerJA`, which is the instance the Japanese locale entry carries,
 * so `build` seeds it before the first record.
 */

export const makePersonJa: Maker<Person> = ({ country }, index) => {
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
    country,
    gender: sex,
  };
};

export const makeUserJa: Maker<User> = ({ country }, i) => {
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
    country,
    active: faker.datatype.boolean({ probability: 0.85 }),
    createdAt: faker.date.past({ years: 3, refDate: ANCHOR }).toISOString(),
  };
};

export const makeProductJa: Maker<Product> = ({ currency }, i) => {
  const department = faker.helpers.arrayElement(DEPARTMENTS);
  const item = faker.helpers.arrayElement(department.items);
  const name = `${item.name}${faker.helpers.arrayElement(item.variants)}`;
  const stock = faker.number.int({ min: 0, max: 250 });
  return {
    id: i + 1,
    sku: faker.string.alphanumeric({ length: 8, casing: 'upper' }),
    name,
    department: department.name,
    description: faker.helpers.arrayElements(department.notes, 2).join(''),
    price: yen(...item.price),
    currency,
    rating: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
    stock,
    inStock: stock > 0,
    createdAt: faker.date.past({ years: 2, refDate: ANCHOR }).toISOString(),
  };
};

export const makeCompanyJa: Maker<Company> = ({ country }, i) => {
  const { name, domain, industry } = companyName();
  const { prefecture, city } = place();
  return {
    id: i + 1,
    name,
    industry,
    catchPhrase: faker.helpers.arrayElement(CATCH_PHRASES),
    website: `https://${domain}`,
    email: `info@${domain}`,
    phone: landline(city),
    employees: faker.number.int({ min: 2, max: 25_000 }),
    founded: faker.number.int({ min: 1900, max: 2025 }),
    city,
    province: prefecture,
    country,
  };
};
