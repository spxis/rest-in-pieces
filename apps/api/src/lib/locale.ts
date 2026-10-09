import {
  type Faker,
  fakerDE,
  fakerEN_CA,
  fakerEN_GB,
  fakerEN_IN,
  fakerEN_US,
  fakerES_MX,
  fakerFR,
  fakerFR_CA,
  fakerID_ID,
  fakerJA,
  fakerKO,
  fakerPT_BR,
  fakerRU,
  fakerVI,
  fakerZH_CN,
} from '@faker-js/faker';

/** The writing system a locale's names and places come out in. */
export type Script = 'latin' | 'cyrillic' | 'han' | 'hangul' | 'japanese';

export interface CountryLocale {
  /** The value `locale=` takes. */
  code: string;
  /** BCP 47 language tag, for collation and display. */
  tag: string;
  /** English name. */
  name: string;
  /** The name in the locale's own language. */
  nativeName: string;
  /** ISO 3166-1 alpha-2 code every record carries as `country`. */
  country: string;
  /** ISO 4217 code products are priced in. */
  currency: string;
  /** Roughly how many units of `currency` buy what one Canadian dollar does, so prices read as local. */
  priceScale: number;
  /**
   * The sales tax or VAT an order adds, as a fraction: one headline rate per country (the standard VAT or GST
   * rate, or a representative state or provincial rate where there is no national one). Not tax advice.
   */
  taxRate: number;
  script: Script;
  /**
   * Share of `locale=global` records: roughly each country's developer population on GitHub, in millions.
   * Only the proportions matter.
   */
  weight: number;
  faker: Faker;
}

/**
 * Every data locale, and the one list everything else reads: parsing, `/locales`, `/resources`, the docs
 * and the playground's picker. English (Canada) is the original dataset and the default. Japanese uses
 * hand-built data (`data/ja`); Faker's Japanese locale only supplies its streets and postal codes.
 */
export const LOCALES = [
  {
    code: 'en-CA',
    taxRate: 0.13,
    tag: 'en-CA',
    name: 'English (Canada)',
    nativeName: 'English (Canada)',
    country: 'CA',
    currency: 'CAD',
    priceScale: 1,
    script: 'latin',
    weight: 2.5,
    faker: fakerEN_CA,
  },
  {
    code: 'en-US',
    taxRate: 0.0725,
    tag: 'en-US',
    name: 'English (United States)',
    nativeName: 'English (United States)',
    country: 'US',
    currency: 'USD',
    priceScale: 0.75,
    script: 'latin',
    weight: 22,
    faker: fakerEN_US,
  },
  {
    code: 'en-IN',
    taxRate: 0.18,
    tag: 'en-IN',
    name: 'English (India)',
    nativeName: 'English (India)',
    country: 'IN',
    currency: 'INR',
    priceScale: 60,
    script: 'latin',
    weight: 17,
    faker: fakerEN_IN,
  },
  {
    code: 'zh-CN',
    taxRate: 0.13,
    tag: 'zh-CN',
    name: 'Chinese (China)',
    nativeName: '中文（中国）',
    country: 'CN',
    currency: 'CNY',
    priceScale: 5,
    script: 'han',
    weight: 11,
    faker: fakerZH_CN,
  },
  {
    code: 'pt-BR',
    taxRate: 0.18,
    tag: 'pt-BR',
    name: 'Portuguese (Brazil)',
    nativeName: 'Português (Brasil)',
    country: 'BR',
    currency: 'BRL',
    priceScale: 4,
    script: 'latin',
    weight: 5,
    faker: fakerPT_BR,
  },
  {
    code: 'en-GB',
    taxRate: 0.2,
    tag: 'en-GB',
    name: 'English (United Kingdom)',
    nativeName: 'English (United Kingdom)',
    country: 'GB',
    currency: 'GBP',
    priceScale: 0.55,
    script: 'latin',
    weight: 4,
    faker: fakerEN_GB,
  },
  {
    code: 'ru',
    taxRate: 0.22,
    tag: 'ru-RU',
    name: 'Russian (Russia)',
    nativeName: 'Русский (Россия)',
    country: 'RU',
    currency: 'RUB',
    priceScale: 60,
    script: 'cyrillic',
    weight: 3,
    faker: fakerRU,
  },
  {
    code: 'de',
    taxRate: 0.19,
    tag: 'de-DE',
    name: 'German (Germany)',
    nativeName: 'Deutsch (Deutschland)',
    country: 'DE',
    currency: 'EUR',
    priceScale: 0.65,
    script: 'latin',
    weight: 3,
    faker: fakerDE,
  },
  {
    code: 'id',
    taxRate: 0.11,
    tag: 'id-ID',
    name: 'Indonesian (Indonesia)',
    nativeName: 'Bahasa Indonesia (Indonesia)',
    country: 'ID',
    currency: 'IDR',
    priceScale: 11_000,
    script: 'latin',
    weight: 3,
    faker: fakerID_ID,
  },
  {
    code: 'ja',
    taxRate: 0.1,
    tag: 'ja-JP',
    name: 'Japanese (Japan)',
    nativeName: '日本語（日本）',
    country: 'JP',
    currency: 'JPY',
    priceScale: 100,
    script: 'japanese',
    weight: 3,
    faker: fakerJA,
  },
  {
    code: 'fr',
    taxRate: 0.2,
    tag: 'fr-FR',
    name: 'French (France)',
    nativeName: 'Français (France)',
    country: 'FR',
    currency: 'EUR',
    priceScale: 0.65,
    script: 'latin',
    weight: 2.5,
    faker: fakerFR,
  },
  {
    code: 'fr-CA',
    taxRate: 0.14975,
    tag: 'fr-CA',
    name: 'French (Canada)',
    nativeName: 'Français (Canada)',
    country: 'CA',
    currency: 'CAD',
    priceScale: 1,
    script: 'latin',
    weight: 0.5,
    faker: fakerFR_CA,
  },
  {
    code: 'ko',
    taxRate: 0.1,
    tag: 'ko-KR',
    name: 'Korean (South Korea)',
    nativeName: '한국어(대한민국)',
    country: 'KR',
    currency: 'KRW',
    priceScale: 1000,
    script: 'hangul',
    weight: 2,
    faker: fakerKO,
  },
  {
    code: 'es-MX',
    taxRate: 0.16,
    tag: 'es-MX',
    name: 'Spanish (Mexico)',
    nativeName: 'Español (México)',
    country: 'MX',
    currency: 'MXN',
    priceScale: 13,
    script: 'latin',
    weight: 2,
    faker: fakerES_MX,
  },
  {
    code: 'vi',
    taxRate: 0.1,
    tag: 'vi-VN',
    name: 'Vietnamese (Vietnam)',
    nativeName: 'Tiếng Việt (Việt Nam)',
    country: 'VN',
    currency: 'VND',
    priceScale: 18_000,
    script: 'latin',
    weight: 2,
    faker: fakerVI,
  },
] as const satisfies readonly CountryLocale[];

export type CountryLocaleCode = (typeof LOCALES)[number]['code'];

/** A per-record mix of every country locale, weighted toward the bigger developer populations. */
export const GLOBAL = 'global';
export const GLOBAL_NAME = 'Global mix';

export type Locale = CountryLocaleCode | typeof GLOBAL;
export const DEFAULT_LOCALE: Locale = 'en-CA';

/** Every value `locale=` accepts, in the order pickers show them. */
export const LOCALE_CODES: readonly Locale[] = [...LOCALES.map((locale) => locale.code), GLOBAL];

const ALIASES = new Map<string, Locale>([
  ['en', 'en-CA'],
  [GLOBAL, GLOBAL],
  ...LOCALES.flatMap((locale): [string, Locale][] => [
    [locale.code.toLowerCase(), locale.code],
    [locale.tag.toLowerCase(), locale.code],
  ]),
]);

export class UnsupportedLocaleError extends Error {
  constructor(value: string) {
    super(`Unsupported locale "${value}". Use one of: ${LOCALE_CODES.join(', ')}.`);
  }
}

/**
 * Reads the `locale` parameter. Case and `_` or `-` don't matter (`en_US`, `pt-br`), and a full tag such as
 * `ja-JP` or `de-DE` names its locale. Missing means the default; anything unknown is an error rather than
 * a silent guess.
 */
export function parseLocale(value: string | undefined): Locale {
  if (value === undefined || value === '') return DEFAULT_LOCALE;
  const locale = ALIASES.get(value.toLowerCase().replaceAll('_', '-'));
  if (!locale) throw new UnsupportedLocaleError(value);
  return locale;
}

export function countryLocale(code: CountryLocaleCode): CountryLocale {
  return LOCALES.find((locale) => locale.code === code) as CountryLocale;
}

/** Labels a response with its locale. The mix is in many languages at once, so it carries no label. */
export function contentLanguage(c: { header(name: string, value: string): void }, locale: Locale): void {
  if (locale !== GLOBAL) c.header('Content-Language', locale);
}

/** The BCP 47 tag to collate and format a dataset with, or `undefined` for the mix. */
export function localeTag(locale: Locale): string | undefined {
  return locale === GLOBAL ? undefined : countryLocale(locale).tag;
}
