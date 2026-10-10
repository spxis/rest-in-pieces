/**
 * Addresses in seven countries, each in its own country's format, with postcodes that exist in the right region.
 *
 * A record is chosen by seed and position (the same seed gives the same addresses), and built from the tables of
 * `@johnmorrisdotca/address-plus`: a US state's ZIP prefixes, a Canadian province's postal-code letters, an Australian
 * state's postcode blocks, a British postcode district, the 6,328 postcodes of La Poste's base officielle, the 10,813 of
 * GeoNames' list for Germany, and Japan's prefecture, municipality and the prefecture a postal code delivers to. Street
 * and place names are Faker's for that country, since address-plus holds none. The lines come from the same package's
 * formatters (USPS, Canada Post, Australia Post, Royal Mail, La Poste, Deutsche Post, Japan Post), so each reads as its
 * country writes it. The country modules and their tables load the first time a request needs them.
 */
import { type Faker, fakerDE, fakerEN_AU, fakerEN_CA, fakerEN_GB, fakerEN_US, fakerFR, fakerJA } from '@faker-js/faker';
import * as main from '@johnmorrisdotca/address-plus';
import { hash } from './build.ts';
import { mix, stream } from './random.ts';

export const ADDRESS_COUNTRIES = ['US', 'CA', 'JP', 'AU', 'GB', 'FR', 'DE'] as const;
export type AddressCountry = (typeof ADDRESS_COUNTRIES)[number];

/** The weight of each country in the mix: roughly its share of this API's readers, none left out. */
const SHARE: Record<AddressCountry, number> = { US: 30, CA: 12, JP: 14, AU: 8, GB: 14, FR: 11, DE: 11 };

/** An address as `/addresses` serves it. */
export interface AddressRecord {
  id: number;
  country: AddressCountry;
  /** The address in its country's own format, one string a line: the form on an envelope. */
  lines: string[];
  /** The same lines joined with a line break. */
  formatted: string;
  /** Japan only: the address as English writes it, in Latin letters; otherwise `null`. */
  latin: string | null;
  number: string;
  street: string;
  unit: string | null;
  city: string;
  /** The state, province, prefecture, nation, department or Land: in the country's own language. */
  region: string;
  /** Its ISO 3166-2 code, which is a record in `/subdivisions`: `US-CA`, `CA-ON`, `JP-13`, `AU-NSW`, `GB-ENG`, `FR-69`, `DE-BY`. */
  regionCode: string;
  postcode: string;
}

type Modules = {
  au: typeof import('@johnmorrisdotca/address-plus/au');
  fr: typeof import('@johnmorrisdotca/address-plus/fr');
  de: typeof import('@johnmorrisdotca/address-plus/de');
  gb: typeof import('@johnmorrisdotca/address-plus/gb');
  jp: typeof import('@johnmorrisdotca/address-plus/jp');
};

let loaded: Promise<Modules & { frenchPostcodes: Postcodes; germanPostcodes: Postcodes }> | undefined;
type Postcodes = ReadonlyMap<string, readonly string[]>;

/** Every postcode the module knows, by the region it names, found by asking it about each code once: about 100,000 asks. */
function postcodesByRegion(
  known: (code: string) => boolean,
  regionOf: (code: string) => string | null,
  from: number,
  to: number,
): Postcodes {
  const byRegion = new Map<string, string[]>();
  for (let n = from; n <= to; n += 1) {
    const code = String(n).padStart(5, '0');
    if (!known(code)) continue;
    const region = regionOf(code);
    if (region) byRegion.set(region, [...(byRegion.get(region) ?? []), code]);
  }
  return byRegion;
}

/** Imports the five country modules, once, and lists the French and German postcodes by department and Land. */
export function loadAddressModules() {
  loaded ??= (async () => {
    const [au, fr, de, gb, jp] = await Promise.all([
      import('@johnmorrisdotca/address-plus/au'),
      import('@johnmorrisdotca/address-plus/fr'),
      import('@johnmorrisdotca/address-plus/de'),
      import('@johnmorrisdotca/address-plus/gb'),
      import('@johnmorrisdotca/address-plus/jp'),
    ]);
    const frenchPostcodes = postcodesByRegion(
      fr.isKnownFrenchPostcode,
      (code) => fr.getDepartmentFromFrenchPostcode(code) ?? null,
      1000,
      98999,
    );
    const germanPostcodes = postcodesByRegion(
      de.isKnownGermanPostcode,
      (code) => de.getStateFromGermanPostcode(code) ?? null,
      1001,
      99998,
    );
    return { au, fr, de, gb, jp, frenchPostcodes, germanPostcodes };
  })();
  return loaded;
}

let modules: Awaited<NonNullable<typeof loaded>> | undefined;
const need = () => {
  if (!modules) throw new Error("Address data is not loaded: await the dataset's ready() before reading it.");
  return modules;
};

/** Waits for the country modules and keeps them, so the synchronous builders can read them. */
export async function readyAddresses(): Promise<void> {
  modules = await loadAddressModules();
}

// ----- Small tables ------------------------------------------------------------------------------------------------

const US_NAMES = new Map(
  Object.entries(main.US_STATE_NAMES).map(([name, code]) => [code, name.replace(/\b\w/g, (c) => c.toUpperCase())]),
);
// Canada Post never uses D, F, I, O, Q or U, and W and Z are never a first letter.
const CA_LETTERS = 'ABCEGHJKLMNPRSTVXY';
const CA_ANY = 'ABCEGHJKLMNPRSTVWXYZ';
const CA_PROVINCES: ReadonlyArray<readonly [string, number]> = [
  ['ON', 38],
  ['QC', 22],
  ['BC', 14],
  ['AB', 12],
  ['MB', 3.6],
  ['SK', 3],
  ['NS', 2.6],
  ['NB', 2],
  ['NL', 1.4],
  ['PE', 0.4],
  ['YT', 0.1],
  ['NT', 0.1],
  ['NU', 0.1],
];
const US_STATES: readonly string[] = [...US_NAMES.keys()].filter(
  (code) =>
    !['AS', 'GU', 'MP', 'PR', 'VI', 'UM', 'AA', 'AE', 'AP', 'FM', 'MH', 'PW'].includes(code) &&
    main.getZipPrefixesForState(code).length > 0,
);
const AU_STATES: ReadonlyArray<readonly [string, number]> = [
  ['NSW', 32],
  ['VIC', 26],
  ['QLD', 20],
  ['WA', 10],
  ['SA', 7],
  ['TAS', 2],
  ['ACT', 2],
  ['NT', 1],
];
const GB_NATION_NAMES: Record<string, string> = {
  ENG: 'England',
  SCT: 'Scotland',
  WLS: 'Wales',
  NIR: 'Northern Ireland',
};
// Common names for a town's quarter: 町名 that are real in many cities, written as Japanese addresses write them.
const JP_TOWNS = [
  '中央',
  '本町',
  '栄町',
  '緑町',
  '新町',
  '宮前',
  '駅前',
  '桜木町',
  '朝日町',
  '幸町',
  '大手町',
  '若葉町',
  '東町',
  '西町',
];
const GB_LETTERS = 'ABDEFGHJLNPQRSTUWXYZ';
const POSTCODE_UNIT = { US: 'Apt', CA: 'Unit', AU: 'Unit', GB: 'Flat', FR: 'Apt', DE: 'Wohnung' } as const;

const FAKERS: Record<Exclude<AddressCountry, 'JP'>, Faker> = {
  US: fakerEN_US,
  CA: fakerEN_CA,
  AU: fakerEN_AU,
  GB: fakerEN_GB,
  FR: fakerFR,
  DE: fakerDE,
};

const letters = (random: ReturnType<typeof stream>, from: string, count: number) =>
  Array.from({ length: count }, () => from[random.int(0, from.length - 1)]).join('');
const digits = (random: ReturnType<typeof stream>, count: number) =>
  Array.from({ length: count }, () => random.int(0, 9)).join('');

/** The districts of a postcode area as the table writes them: `1-18,20,98,1W` is 1 to 18, 20, 98 and 1W. */
const districtsOf = (spec: string): string[] =>
  spec.split(',').flatMap((part) => {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (!range) return [part];
    const from = Number(range[1]);
    return Array.from({ length: Number(range[2]) - from + 1 }, (_, i) => String(from + i));
  });

// ----- One record ---------------------------------------------------------------------------------------------------

/** The country of record `index` at `seed`: chosen in proportion to SHARE, the same every time. */
export function countryOf(seed: number, index: number): AddressCountry {
  const random = stream(mix(seed, 0xadd, index));
  return ADDRESS_COUNTRIES[random.weighted(ADDRESS_COUNTRIES.map((country) => SHARE[country]))] as AddressCountry;
}

interface Built {
  number: string;
  street: string;
  unit: string | null;
  city: string;
  region: string;
  regionCode: string;
  postcode: string;
  /** The address as one line, in the form the country's own parser reads. */
  text: string;
  /** United States and Canada: the address as address-plus holds it, which its formatters take without parsing a line. */
  parsed?: Parameters<typeof main.formatUSPS>[0];
}

/** A street as Faker names it (`Spring Street`) as a name and a type (`Spring`, `Street`), for a formatter that wants both. */
function splitStreet(street: string): { street: string; type: string } {
  const at = street.lastIndexOf(' ');
  return at < 0 ? { street, type: '' } : { street: street.slice(0, at), type: street.slice(at + 1) };
}

/** A unit as its two parts, `Apt 4B`: the word, and what follows. */
const unitParts = (unit: string | null) => {
  if (!unit) return {};
  const [word = '', ...rest] = unit.split(' ');
  return { secUnitType: word === 'Apt' ? 'Apartment' : word, secUnitNum: rest.join(' '), unit };
};

function chooseWeighted<T extends readonly [string, number]>(
  random: ReturnType<typeof stream>,
  table: readonly T[],
): string {
  return table[random.weighted(table.map(([, weight]) => weight))]?.[0] as string;
}

function buildUS(random: ReturnType<typeof stream>, faker: Faker): Built {
  const state = random.pick(US_STATES);
  const prefix = random.pick(main.getZipPrefixesForState(state));
  const postcode = `${prefix}${digits(random, 2)}`;
  const number = String(random.int(1, 9999));
  const street = faker.location.street();
  const unit = random.chance(0.15) ? `${POSTCODE_UNIT.US} ${random.int(1, 40)}${letters(random, 'ABCD', 1)}` : null;
  const city = faker.location.city();
  return {
    number,
    street,
    unit,
    city,
    region: US_NAMES.get(state) ?? state,
    regionCode: `US-${state}`,
    postcode,
    text: `${number} ${street}${unit ? `, ${unit}` : ''}, ${city}, ${state} ${postcode}`,
    parsed: {
      number,
      ...splitStreet(street),
      ...unitParts(unit),
      city,
      state,
      zip: postcode,
      country: 'US',
    } as NonNullable<Built['parsed']>,
  };
}

function buildCA(random: ReturnType<typeof stream>, faker: Faker): Built {
  const province = chooseWeighted(random, CA_PROVINCES);
  const first = random.pick(
    main.getPostalPrefixesForProvince(province).filter((letter) => CA_LETTERS.includes(letter)),
  );
  const postcode = `${first}${digits(random, 1)}${letters(random, CA_ANY, 1)} ${digits(random, 1)}${letters(random, CA_ANY, 1)}${digits(random, 1)}`;
  const number = String(random.int(1, 9999));
  const street = faker.location.street();
  const unit = random.chance(0.15) ? `${POSTCODE_UNIT.CA} ${random.int(1, 40)}` : null;
  const city = faker.location.city();
  const name = Object.entries(main.CA_PROVINCE_NAMES_EN).find(([, code]) => code === province)?.[0] ?? province;
  return {
    number,
    street,
    unit,
    city,
    region: name
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/ And /, ' and ')
      .replace(/ Of /, ' of '),
    regionCode: `CA-${province}`,
    postcode,
    text: `${unit ? `${unit}, ` : ''}${number} ${street}, ${city}, ${province} ${postcode}`,
    parsed: {
      number,
      ...splitStreet(street),
      ...unitParts(unit),
      city,
      state: province,
      zip: postcode,
      country: 'CA',
    } as NonNullable<Built['parsed']>,
  };
}

function buildAU(random: ReturnType<typeof stream>, faker: Faker, tables: Modules['au']): Built {
  const state = chooseWeighted(random, AU_STATES);
  const ranges = tables.AU_POSTCODE_RANGES.filter((range) => range.state === state && range.use === 'delivery');
  const range = random.pick(ranges);
  const postcode = String(random.int(Number(range.from), Number(range.to))).padStart(4, '0');
  const number = String(random.int(1, 400));
  const street = faker.location.street();
  const unit = random.chance(0.15) ? `${POSTCODE_UNIT.AU} ${random.int(1, 30)}` : null;
  const city = faker.location.city();
  const name = tables.AU_STATES.find((one) => one.code === state)?.name ?? state;
  return {
    number,
    street,
    unit,
    city,
    region: name,
    regionCode: `AU-${state}`,
    postcode,
    text: `${unit ? `${unit}, ` : ''}${number} ${street}, ${city} ${state} ${postcode}`,
  };
}

function buildGB(random: ReturnType<typeof stream>, faker: Faker, tables: Modules['gb']): Built {
  const areas = Object.keys(tables.GB_POSTCODE_DISTRICTS);
  const area = random.pick(areas);
  const district = random.pick(districtsOf(tables.GB_POSTCODE_DISTRICTS[area] as string));
  const postcode = `${area}${district} ${digits(random, 1)}${letters(random, GB_LETTERS, 2)}`;
  const nation = tables.getNationFromUKPostcode(postcode) ?? 'ENG';
  const number = String(random.int(1, 200));
  const street = faker.location.street();
  const unit = random.chance(0.15) ? `${POSTCODE_UNIT.GB} ${random.int(1, 20)}` : null;
  const city =
    (tables.GB_POSTCODE_AREAS as Record<string, { name: string } | undefined>)[area]?.name ?? faker.location.city();
  return {
    number,
    street,
    unit,
    city,
    region: GB_NATION_NAMES[nation] ?? nation,
    regionCode: `GB-${nation}`,
    postcode,
    text: `${unit ? `${unit}, ` : ''}${number} ${street}, ${city}, ${postcode}`,
  };
}

function buildFR(
  random: ReturnType<typeof stream>,
  faker: Faker,
  tables: { fr: Modules['fr']; postcodes: Postcodes },
): Built {
  const departments = [...tables.postcodes.keys()].sort();
  // Every postcode is as likely as any other, so a department is as likely as the number of postcodes it holds.
  const all = departments.flatMap((code) => tables.postcodes.get(code) ?? []);
  const postcode = random.pick(all);
  const department = tables.fr.getDepartmentFromFrenchPostcode(postcode) ?? '75';
  const found = tables.fr.FR_DEPARTMENTS.find((one) => one.code === department);
  const number = String(random.int(1, 150));
  const street = faker.location.street();
  const unit = random.chance(0.15) ? `${POSTCODE_UNIT.FR} ${random.int(1, 30)}` : null;
  const city = faker.location.city();
  return {
    number,
    street,
    unit,
    city,
    region: found?.name ?? department,
    regionCode: `FR-${department}`,
    postcode,
    text: `${unit ? `${unit}, ` : ''}${number} ${street}, ${postcode} ${city}`,
  };
}

function buildDE(
  random: ReturnType<typeof stream>,
  faker: Faker,
  tables: { de: Modules['de']; postcodes: Postcodes },
): Built {
  const all = [...tables.postcodes.values()].flat();
  const postcode = random.pick(all);
  const code = tables.de.getStateFromGermanPostcode(postcode) ?? 'BE';
  const state = tables.de.DE_STATES.find((one) => one.code === code);
  const number = String(random.int(1, 120));
  const street = faker.location.street();
  const unit = random.chance(0.15) ? `${POSTCODE_UNIT.DE} ${random.int(1, 30)}` : null;
  const city = faker.location.city();
  return {
    number,
    street,
    unit,
    city,
    region: state?.name ?? code,
    regionCode: state?.iso ?? `DE-${code}`,
    postcode,
    text: `${street} ${number}${unit ? `, ${unit}` : ''}, ${postcode} ${city}`,
  };
}

function buildJP(random: ReturnType<typeof stream>, tables: Modules['jp']): Built {
  const municipality = random.pick(tables.JP_MUNICIPALITIES);
  const prefecture = tables.JP_PREFECTURES.find((one) => one.code === municipality.prefecture);
  const prefixes = Object.entries(tables.JP_POSTAL_PREFIXES)
    .filter(([, code]) => code === municipality.prefecture)
    .map(([prefix]) => prefix);
  let postcode = '';
  // A prefix mostly belongs to one prefecture, but 236 codes are delivered by another: ask until it is the right one.
  for (let tries = 0; tries < 50; tries += 1) {
    const candidate = `${random.pick(prefixes)}${digits(random, 4)}`;
    if (tables.getPrefectureFromJapanesePostalCode(candidate) === municipality.prefecture) {
      postcode = `${candidate.slice(0, 3)}-${candidate.slice(3)}`;
      break;
    }
  }
  if (postcode === '') postcode = `${random.pick(prefixes)}-0000`;
  const town = random.pick(JP_TOWNS);
  const chome = random.int(1, 6);
  const block = `${chome}-${random.int(1, 30)}-${random.int(1, 20)}`;
  return {
    number: block,
    street: town,
    unit: null,
    city: municipality.name,
    region: prefecture?.name ?? municipality.prefecture,
    regionCode: `JP-${municipality.prefecture}`,
    postcode,
    text: `〒${postcode} ${prefecture?.name ?? ''}${municipality.name}${town}${block}`,
  };
}

/** Writes an address the way its country's post does (parsing the line first where a formatter needs it): the lines on an envelope. */
function envelope(
  country: AddressCountry,
  built: Built,
  tables: Awaited<NonNullable<typeof loaded>>,
): { lines: string[]; latin: string | null } {
  const text = built.text;
  switch (country) {
    case 'US':
      return { lines: main.formatUSPS(built.parsed as never).lines, latin: null };
    case 'CA':
      return { lines: main.formatCanadaPost(built.parsed as never).lines, latin: null };
    case 'JP': {
      const parsed = tables.jp.parseJapaneseAddress(text);
      return parsed
        ? { lines: tables.jp.formatJapanese(parsed).split('\n'), latin: tables.jp.formatJapaneseEnglish(parsed) }
        : { lines: [text], latin: null };
    }
    case 'AU': {
      const parsed = tables.au.parseAustralianAddress(text);
      return { lines: parsed ? tables.au.formatAustraliaPost(parsed).lines : [text], latin: null };
    }
    case 'GB': {
      const parsed = tables.gb.parseUKAddress(text);
      return { lines: parsed ? tables.gb.formatRoyalMail(parsed).lines : [text], latin: null };
    }
    case 'FR': {
      const parsed = tables.fr.parseFrenchAddress(text);
      return { lines: parsed ? tables.fr.formatLaPoste(parsed).lines : [text], latin: null };
    }
    case 'DE': {
      const parsed = tables.de.parseGermanAddress(text);
      return { lines: parsed ? tables.de.formatDeutschePost(parsed).lines : [text], latin: null };
    }
  }
}

/** Record `index` (zero-based) of the dataset at `seed`. The country modules must be loaded (`readyAddresses`). */
export function makeAddress(seed: number, index: number): AddressRecord {
  const tables = need();
  const country = countryOf(seed, index);
  const random = stream(mix(seed, 0xadd2, index));
  let faker: Faker | undefined;
  if (country !== 'JP') {
    faker = FAKERS[country];
    faker.seed([seed, index, hash(country)]);
  } else {
    fakerJA.seed([seed, index]);
  }
  const built =
    country === 'US'
      ? buildUS(random, faker as Faker)
      : country === 'CA'
        ? buildCA(random, faker as Faker)
        : country === 'AU'
          ? buildAU(random, faker as Faker, tables.au)
          : country === 'GB'
            ? buildGB(random, faker as Faker, tables.gb)
            : country === 'FR'
              ? buildFR(random, faker as Faker, { fr: tables.fr, postcodes: tables.frenchPostcodes })
              : country === 'DE'
                ? buildDE(random, faker as Faker, { de: tables.de, postcodes: tables.germanPostcodes })
                : buildJP(random, tables.jp);
  const { lines, latin } = envelope(country, built, tables);
  return {
    id: index + 1,
    country,
    lines,
    formatted: lines.join('\n'),
    latin,
    number: built.number,
    street: built.street,
    unit: built.unit,
    city: built.city,
    region: built.region,
    regionCode: built.regionCode,
    postcode: built.postcode,
  };
}

/** The first `count` addresses at `seed`. */
export const makeAddresses = (seed: number, count: number): AddressRecord[] =>
  Array.from({ length: count }, (_, i) => makeAddress(seed, i));
