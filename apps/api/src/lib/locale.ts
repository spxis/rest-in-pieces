import { type Faker, fakerEN_CA, fakerJA } from '@faker-js/faker';

/** The data locales on offer. English (Canada) is the original dataset and the default. */
export const LOCALES = ['en-CA', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en-CA';

const ALIASES: Record<string, Locale> = { en: 'en-CA', 'en-ca': 'en-CA', ja: 'ja', 'ja-jp': 'ja' };

export class UnsupportedLocaleError extends Error {
  constructor(value: string) {
    super(`Unsupported locale "${value}". Use one of: ${LOCALES.join(', ')}.`);
  }
}

/** Reads the `locale` parameter. Missing means the default; anything unknown is an error rather than a silent guess. */
export function parseLocale(value: string | undefined): Locale {
  if (value === undefined || value === '') return DEFAULT_LOCALE;
  const locale = ALIASES[value.toLowerCase().replace('_', '-')];
  if (!locale) throw new UnsupportedLocaleError(value);
  return locale;
}

export function fakerFor(locale: Locale): Faker {
  return locale === 'ja' ? fakerJA : fakerEN_CA;
}
