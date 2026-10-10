import type { Faker } from '@faker-js/faker';
import {
  type CompiledExpression,
  compileExpression,
  EXPRESSION_LIMITS,
  ExpressionError,
  startOfToday,
} from '../lib/expression.ts';
import { type CountryLocale, countryLocale, DEFAULT_LOCALE, type Locale } from '../lib/locale.ts';
import {
  ALL_TEST_CARDS,
  avatarUrl,
  safeEmail,
  safeEmailsIn,
  safeHost,
  safeIpv4,
  safeIpv6,
  safePhone,
  TEST_CARDS,
} from '../lib/safe.ts';
import { build } from './build.ts';

/** Faker modules offered to custom schemas. Helpers, seeding and locale internals are left out on purpose. */
const MODULES = [
  'airline',
  'animal',
  'book',
  'color',
  'commerce',
  'company',
  'database',
  'date',
  'finance',
  'food',
  'git',
  'hacker',
  'image',
  'internet',
  'location',
  'lorem',
  'music',
  'number',
  'person',
  'phone',
  'science',
  'string',
  'system',
  'vehicle',
  'word',
] as const;

/** Methods that work without arguments but produce values too large for list responses. */
const EXCLUDED = new Set(['image.dataUri', 'image.personPortrait']);

/** Produces one value for a record built in the given locale, usually by calling a method on its Faker. */
type Generator = (locale: CountryLocale) => unknown;

/** Types that read the record's locale rather than Faker, so a `locale=global` schema can say where each row is from. */
const LOCALE_GENERATORS: Record<string, Generator> = {
  'locale.country': (locale) => locale.country,
  'locale.currency': (locale) => locale.currency,
};

function methodNames(target: object): string[] {
  const names = new Set<string>();
  for (
    let proto = Object.getPrototypeOf(target);
    proto && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name !== 'constructor' && !name.startsWith('_')) names.add(name);
    }
  }
  return [...names];
}

/**
 * Some locales have no data for a method on purpose (Russian has no name prefixes or suffixes), and Faker
 * throws there rather than fall back. Such a field comes back `null` instead of failing the request.
 */
const orNull =
  (generate: Generator): Generator =>
  (locale) => {
    try {
      return generate(locale);
    } catch {
      return null;
    }
  };

function buildRegistry(): Map<string, Generator> {
  const registry = new Map<string, Generator>(Object.entries(LOCALE_GENERATORS));
  // Methods are discovered on the default locale's instance; each record calls them on its own locale's.
  const probe = countryLocale('en-CA');
  // Faker reports deprecated methods through console.warn; those are left out rather than offered.
  const warn = console.warn;
  let deprecated = false;
  console.warn = () => {
    deprecated = true;
  };
  for (const module of MODULES) {
    const instance = probe.faker[module] as unknown as Record<string, unknown>;
    for (const method of methodNames(instance)) {
      const type = `${module}.${method}`;
      const fn = instance[method];
      if (EXCLUDED.has(type) || typeof fn !== 'function') continue;
      const generate: Generator = (locale) => {
        const target = locale.faker[module] as unknown as Record<string, () => unknown>;
        return target[method]?.call(target);
      };
      // Only methods that work without arguments are offered.
      try {
        deprecated = false;
        generate(probe);
        if (!deprecated) registry.set(type, orNull(generate));
      } catch {}
    }
  }
  console.warn = warn;
  return registry;
}

const registry = buildRegistry();

/** Every generator type, sorted, e.g. `person.fullName`. */
export const generatorTypes: string[] = [...registry.keys()].sort();

/** Generator types grouped by module, for pickers. */
export const generatorModules: Record<string, string[]> = Object.groupBy(
  generatorTypes,
  (type) => type.split('.')[0] ?? '',
) as Record<string, string[]>;
for (const [module, types] of Object.entries(generatorModules)) {
  generatorModules[module] = types.map((type) => type.slice(module.length + 1));
}

export function hasGenerator(type: string): boolean {
  return registry.has(type);
}

export interface FieldSpec {
  name: string;
  /** A generator type, optionally with arguments and a blank rate: `number.int(18,65)`, `pick(a,b|70,30)?blank=10`. */
  type: string;
}

export const MAX_FIELDS = 50;
export const FIELD_NAME = /^[A-Za-z_][\w-]{0,63}$/;
/** The most choices `pick` takes, and the longest any one may be. */
export const MAX_CHOICES = 50;
export const MAX_CHOICE_LENGTH = 64;

/** A field list the API cannot read at all: an unknown type, a bad name, a malformed list. Answered with `400`. */
export class SchemaError extends Error {}

/** A known type given arguments, choices or a blank rate it cannot use. Answered with `422`, naming the field. */
export class FieldError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`Field "${field}": ${message}`);
    this.field = field;
  }
}

/** What a request adds to generation: safe values, and the API's own address for the avatars and images they use. */
export interface GenerateContext {
  safe: boolean;
  base: string;
}

const UNSAFE: GenerateContext = { safe: false, base: '' };

type Kind = 'int' | 'number' | 'date' | 'choice';
interface Param {
  name: string;
  kind: Kind;
  min?: number;
  max?: number;
  optional?: boolean;
  choices?: readonly string[];
}
type Value = number | string | Date;
interface ArgumentSpec {
  params: readonly Param[];
  call(faker: Faker, values: readonly Value[], context: GenerateContext): unknown;
  /** Checks arguments against each other once they are read; returns what is wrong, if anything. */
  check?(values: readonly Value[]): string | undefined;
}

const int = (name: string, min: number, max: number, optional = false): Param => ({
  name,
  kind: 'int',
  min,
  max,
  optional,
});
const num = (name: string, min: number, max: number, optional = false): Param => ({
  name,
  kind: 'number',
  min,
  max,
  optional,
});
const LARGE = 1e15;
const count = (name: string, max: number) => int(name, 1, max);
const SEXES = ['male', 'female'] as const;
const sex = (): Param => ({ name: 'sex', kind: 'choice', choices: SEXES });

/** One standard normal draw from two uniform ones: Box-Muller, always the same number of draws. */
function gauss(f: Faker): number {
  const u1 = 1 - f.number.float();
  const u2 = f.number.float();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const roundTo = (value: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** A value outside `[min, max]` is drawn again, at most this many times, and then clamped. */
const REDRAWS = 20;

function within(draw: () => number, min: number | undefined, max: number | undefined): number {
  let value = draw();
  for (let i = 0; i < REDRAWS && ((min !== undefined && value < min) || (max !== undefined && value > max)); i++) {
    value = draw();
  }
  if (min !== undefined && value < min) value = min;
  if (max !== undefined && value > max) value = max;
  return value;
}

/** The most ranks `number.zipf` takes. */
export const MAX_ZIPF_RANKS = 10_000;

const zipfTables = new Map<string, Float64Array>();

/** Cumulative shares of ranks 1..n at exponent s, built once per `(n, s)` and kept for the last 64 kinds. */
function zipfTable(n: number, s: number): Float64Array {
  const key = `${n}:${s}`;
  const known = zipfTables.get(key);
  if (known) return known;
  const table = new Float64Array(n);
  let total = 0;
  for (let k = 1; k <= n; k++) {
    total += 1 / k ** s;
    table[k - 1] = total;
  }
  for (let k = 0; k < n; k++) table[k] = (table[k] as number) / total;
  if (zipfTables.size >= 64) zipfTables.delete(zipfTables.keys().next().value as string);
  zipfTables.set(key, table);
  return table;
}

function zipf(f: Faker, n: number, s: number): number {
  const table = zipfTable(n, s);
  const u = f.number.float();
  let low = 0;
  let high = n - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((table[middle] as number) >= u) high = middle;
    else low = middle + 1;
  }
  return low + 1;
}

const orderedBounds = (min: Value | undefined, max: Value | undefined): string | undefined =>
  min !== undefined && max !== undefined && (min as number) > (max as number)
    ? `min (${min}) must not be greater than max (${max}).`
    : undefined;

/** Types that take arguments, and how each argument is read. Bounds keep every value, and so every response, small. */
const ARGUMENTS: Record<string, ArgumentSpec> = {
  'number.int': {
    params: [int('min', -LARGE, LARGE), int('max', -LARGE, LARGE)],
    call: (f, [min, max]) => f.number.int({ min: min as number, max: max as number }),
  },
  'number.float': {
    params: [num('min', -LARGE, LARGE), num('max', -LARGE, LARGE), int('fractionDigits', 0, 10, true)],
    call: (f, [min, max, digits]) =>
      f.number.float({
        min: min as number,
        max: max as number,
        ...(digits === undefined ? {} : { fractionDigits: digits as number }),
      }),
  },
  'number.normal': {
    params: [
      num('mean', -LARGE, LARGE),
      num('sd', 0, LARGE),
      num('min', -LARGE, LARGE, true),
      num('max', -LARGE, LARGE, true),
      int('dec', 0, 10, true),
    ],
    check: ([, , min, max]) => orderedBounds(min, max),
    call: (f, [mean, sd, min, max, dec]) =>
      roundTo(
        within(
          () => (mean as number) + (sd as number) * gauss(f),
          min as number | undefined,
          max as number | undefined,
        ),
        (dec as number | undefined) ?? 2,
      ),
  },
  'number.lognormal': {
    params: [
      num('median', 1e-9, LARGE),
      num('sigma', 0, 10),
      num('min', -LARGE, LARGE, true),
      num('max', -LARGE, LARGE, true),
      int('dec', 0, 10, true),
    ],
    check: ([, , min, max]) => orderedBounds(min, max),
    call: (f, [median, sigma, min, max, dec]) =>
      roundTo(
        within(
          () => (median as number) * Math.exp((sigma as number) * gauss(f)),
          min as number | undefined,
          max as number | undefined,
        ),
        (dec as number | undefined) ?? 2,
      ),
  },
  'number.exponential': {
    params: [num('mean', 1e-9, LARGE), num('max', 0, LARGE, true), int('dec', 0, 10, true)],
    call: (f, [mean, max, dec]) =>
      roundTo(
        within(() => -(mean as number) * Math.log(1 - f.number.float()), undefined, max as number | undefined),
        (dec as number | undefined) ?? 2,
      ),
  },
  'number.zipf': {
    params: [int('n', 1, MAX_ZIPF_RANKS), num('s', 0, 5, true)],
    call: (f, [n, s]) => zipf(f, n as number, (s as number | undefined) ?? 1),
  },
  'commerce.price': {
    params: [num('min', 0, LARGE), num('max', 0, LARGE), int('dec', 0, 4, true)],
    call: (f, [min, max, dec]) =>
      f.commerce.price({ min: min as number, max: max as number, dec: (dec as number) ?? 2 }),
  },
  'finance.amount': {
    params: [num('min', -LARGE, LARGE), num('max', -LARGE, LARGE), int('dec', 0, 4, true)],
    call: (f, [min, max, dec]) =>
      f.finance.amount({ min: min as number, max: max as number, dec: (dec as number) ?? 2 }),
  },
  'date.past': { params: [count('years', 200)], call: (f, [years]) => f.date.past({ years: years as number }) },
  'date.future': { params: [count('years', 200)], call: (f, [years]) => f.date.future({ years: years as number }) },
  'date.recent': { params: [count('days', 36500)], call: (f, [days]) => f.date.recent({ days: days as number }) },
  'date.soon': { params: [count('days', 36500)], call: (f, [days]) => f.date.soon({ days: days as number }) },
  'date.between': {
    params: [
      { name: 'from', kind: 'date' },
      { name: 'to', kind: 'date' },
    ],
    call: (f, [from, to]) => f.date.between({ from: from as Date, to: to as Date }),
  },
  'date.birthdate': {
    params: [int('minAge', 0, 120), int('maxAge', 0, 120)],
    call: (f, [min, max]) => f.date.birthdate({ mode: 'age', min: min as number, max: max as number }),
  },
  'string.alpha': { params: [count('length', 256)], call: (f, [length]) => f.string.alpha(length as number) },
  'string.alphanumeric': {
    params: [count('length', 256)],
    call: (f, [length]) => f.string.alphanumeric(length as number),
  },
  'string.numeric': { params: [count('length', 256)], call: (f, [length]) => f.string.numeric(length as number) },
  'string.hexadecimal': {
    params: [count('length', 256)],
    call: (f, [length]) => f.string.hexadecimal({ length: length as number }),
  },
  'string.sample': { params: [count('length', 256)], call: (f, [length]) => f.string.sample(length as number) },
  'lorem.words': { params: [count('count', 50)], call: (f, [n]) => f.lorem.words(n as number) },
  'lorem.sentence': { params: [count('words', 50)], call: (f, [n]) => f.lorem.sentence(n as number) },
  'lorem.sentences': { params: [count('count', 20)], call: (f, [n]) => f.lorem.sentences(n as number) },
  'lorem.paragraph': { params: [count('sentences', 20)], call: (f, [n]) => f.lorem.paragraph(n as number) },
  'lorem.paragraphs': { params: [count('count', 10)], call: (f, [n]) => f.lorem.paragraphs(n as number) },
  'lorem.lines': { params: [count('count', 20)], call: (f, [n]) => f.lorem.lines(n as number) },
  'word.words': { params: [count('count', 50)], call: (f, [n]) => f.word.words(n as number) },
  'internet.password': {
    params: [int('length', 4, 128)],
    call: (f, [length]) => f.internet.password({ length: length as number }),
  },
  'person.firstName': { params: [sex()], call: (f, [s]) => f.person.firstName(s as (typeof SEXES)[number]) },
  'person.lastName': { params: [sex()], call: (f, [s]) => f.person.lastName(s as (typeof SEXES)[number]) },
  'person.fullName': { params: [sex()], call: (f, [s]) => f.person.fullName({ sex: s as (typeof SEXES)[number] }) },
  'location.latitude': {
    params: [num('min', -90, 90), num('max', -90, 90), int('precision', 0, 10, true)],
    call: (f, [min, max, precision]) =>
      f.location.latitude({
        min: min as number,
        max: max as number,
        ...(precision === undefined ? {} : { precision: precision as number }),
      }),
  },
  'location.longitude': {
    params: [num('min', -180, 180), num('max', -180, 180), int('precision', 0, 10, true)],
    call: (f, [min, max, precision]) =>
      f.location.longitude({
        min: min as number,
        max: max as number,
        ...(precision === undefined ? {} : { precision: precision as number }),
      }),
  },
  'finance.creditCardNumber': {
    params: [{ name: 'issuer', kind: 'choice', choices: Object.keys(TEST_CARDS) }],
    call: (f, [issuer], { safe }) =>
      safe
        ? f.helpers.arrayElement(TEST_CARDS[issuer as string] ?? ALL_TEST_CARDS)
        : f.finance.creditCardNumber(issuer as string),
  },
  'image.url': {
    params: [int('width', 1, 4000), int('height', 1, 4000)],
    call: (f, [width, height], { safe, base }) =>
      safe
        ? `${base}/images/${width}x${height}.svg`
        : f.image.url({ width: width as number, height: height as number }),
  },
};

/** Every type that takes arguments, with them in order, for `/generators` and the playground. */
export const generatorParameters: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(ARGUMENTS).map(([type, { params }]) => [
      type,
      params.map((p) => (p.optional ? `${p.name}?` : p.name)).join(', '),
    ]),
  ),
  pick: 'choice, choice, … | weight, weight, …',
};

/**
 * What `safe=true` puts in place of a type that could reach a real person or host. Each still draws from the
 * record's own Faker, so the same seed gives the same safe values.
 */
const SAFE_GENERATORS: Record<string, (locale: CountryLocale, context: GenerateContext) => unknown> = {
  'internet.email': ({ faker }) => safeEmail(faker.internet.email()),
  'internet.url': ({ faker }) => `https://${safeHost(faker.internet.domainWord(), faker.number.int(1023))}/`,
  'internet.domainName': ({ faker }) => safeHost(faker.internet.domainWord(), faker.number.int(1023)),
  'internet.domainSuffix': ({ faker }) => faker.helpers.arrayElement(['com', 'org', 'net']),
  'internet.ip': ({ faker }) =>
    faker.datatype.boolean() ? safeIpv4(faker.number.int()) : safeIpv6(faker.number.int()),
  'internet.ipv4': ({ faker }) => safeIpv4(faker.number.int()),
  'internet.ipv6': ({ faker }) => safeIpv6(faker.number.int()),
  'finance.creditCardNumber': ({ faker }) => faker.helpers.arrayElement(ALL_TEST_CARDS),
  'phone.number': ({ faker, country }) => safePhone(country, faker.number.int()),
  'image.avatar': ({ faker }, { base }) => avatarUrl(base, faker.string.alphanumeric(10)),
  'image.avatarGitHub': ({ faker }, { base }) => avatarUrl(base, faker.string.alphanumeric(10)),
  'image.url': (_, { base }) => `${base}/images/640x480.svg`,
  'image.urlPicsumPhotos': (_, { base }) => `${base}/images/640x480.svg`,
};

/** The types `safe=true` replaces, for the docs. */
export const SAFE_TYPES = Object.keys(SAFE_GENERATORS).sort();

/** A field ready to produce values. */
export interface CompiledField {
  name: string;
  make(locale: CountryLocale, context: GenerateContext): unknown;
  /** Set on a derived field (`=expression`), worked out from the others after they are made. */
  derive?: CompiledExpression;
}

/**
 * Splits on commas that are not inside parentheses, so `a:pick(x,y),b:number.int(1,9)` is two fields. A derived
 * field's expression (`age:=age(born)`) may also hold text in quotes, whose commas and brackets are not read.
 */
export function splitFields(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let seenColon = false;
  let decided = false;
  let expression = false;
  let quote: string | null = null;
  let escaped = false;
  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote && !escaped) quote = null;
      escaped = char === '\\' && !escaped;
      continue;
    }
    if (!seenColon && char === ':') {
      seenColon = true;
      current += char;
      continue;
    }
    if (seenColon && !decided && !/\s/.test(char)) {
      decided = true;
      expression = char === '=';
    }
    if (expression && (char === "'" || char === '"')) {
      quote = char;
      escaped = false;
      current += char;
      continue;
    }
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      seenColon = false;
      decided = false;
      expression = false;
    } else current += char;
  }
  parts.push(current);
  return parts;
}

const EXPRESSION = /^([A-Za-z][\w]*(?:\.[A-Za-z][\w]*)?)(?:\((.*)\))?(?:\?blank=([^?]*))?$/s;

function readValue(field: string, type: string, param: Param, raw: string): Value {
  const wanted = `${type}(${ARGUMENTS[type]?.params.map((p) => p.name).join(', ')})`;
  if (param.kind === 'choice') {
    const value = raw.toLowerCase();
    if (!param.choices?.includes(value)) {
      throw new FieldError(
        field,
        `${param.name} must be one of ${param.choices?.join(', ')}; got "${raw}". Write ${wanted}.`,
      );
    }
    return value;
  }
  if (param.kind === 'date') {
    const date = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(raw) ? new Date(raw) : new Date(Number.NaN);
    if (Number.isNaN(date.getTime()))
      throw new FieldError(field, `${param.name} must be a date such as 2024-01-31; got "${raw}".`);
    return date;
  }
  const number = raw === '' ? Number.NaN : Number(raw);
  const whole = param.kind === 'int';
  if (!Number.isFinite(number) || (whole && !Number.isInteger(number))) {
    throw new FieldError(
      field,
      `${param.name} must be ${whole ? 'a whole number' : 'a number'}; got "${raw}". Write ${wanted}.`,
    );
  }
  if (number < (param.min ?? -Infinity) || number > (param.max ?? Infinity)) {
    throw new FieldError(field, `${param.name} must be from ${param.min} to ${param.max}; got ${raw}.`);
  }
  return number;
}

function compileArguments(field: string, type: string, raw: string): Value[] {
  const spec = ARGUMENTS[type];
  if (!spec) {
    const takes = Object.keys(ARGUMENTS).sort().join(', ');
    throw new FieldError(field, `${type} takes no arguments. These do: ${takes}, and pick.`);
  }
  const given = raw.trim() === '' ? [] : raw.split(',').map((part) => part.trim());
  const required = spec.params.filter((p) => !p.optional).length;
  if (given.length < required || given.length > spec.params.length) {
    const names = spec.params.map((p) => (p.optional ? `${p.name}?` : p.name)).join(', ');
    throw new FieldError(
      field,
      `${type} takes (${names}); got ${given.length} argument${given.length === 1 ? '' : 's'}.`,
    );
  }
  const values = given.map((part, i) => readValue(field, type, spec.params[i] as Param, part));
  const problem = spec.check?.(values);
  if (problem) throw new FieldError(field, problem);
  const [low, high] = values;
  if (spec.params[0]?.name.startsWith('min') && typeof low === 'number' && typeof high === 'number' && low > high) {
    throw new FieldError(field, `the first argument (${low}) must not be greater than the second (${high}).`);
  }
  if (low instanceof Date && high instanceof Date && low > high) {
    throw new FieldError(field, 'from must not be after to.');
  }
  return values;
}

function compilePick(field: string, raw: string | undefined): (faker: Faker) => string {
  if (raw === undefined || raw.trim() === '') {
    throw new FieldError(
      field,
      'pick needs choices, e.g. pick(active,paused,closed) or pick(active,paused,closed|70,20,10).',
    );
  }
  const [list = '', weightList, ...extra] = raw.split('|');
  if (extra.length > 0) throw new FieldError(field, 'pick takes one "|", between the choices and their weights.');
  const choices = list.split(',').map((choice) => choice.trim());
  if (choices.some((choice) => choice === '')) throw new FieldError(field, 'pick has an empty choice.');
  if (choices.length > MAX_CHOICES) throw new FieldError(field, `pick takes at most ${MAX_CHOICES} choices.`);
  const long = choices.find((choice) => choice.length > MAX_CHOICE_LENGTH);
  if (long)
    throw new FieldError(field, `the choice "${long.slice(0, 20)}…" is longer than ${MAX_CHOICE_LENGTH} characters.`);
  if (weightList === undefined) return (faker) => faker.helpers.arrayElement(choices);
  const weights = weightList.split(',').map((weight) => Number(weight.trim()));
  if (weights.length !== choices.length) {
    throw new FieldError(
      field,
      `pick has ${choices.length} choices and ${weights.length} weights; give one weight per choice.`,
    );
  }
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0) || weights.every((weight) => weight === 0)) {
    throw new FieldError(field, 'pick weights must be numbers of 0 or more, and not all 0.');
  }
  const table = choices
    .map((value, i) => ({ value, weight: weights[i] as number }))
    .filter((entry) => entry.weight > 0);
  return (faker) => faker.helpers.weightedArrayElement(table);
}

function compileBlank(field: string, raw: string | undefined): number {
  if (raw === undefined) return 0;
  const match = /^(\d+(?:\.\d+)?)%?$/.exec(raw.trim());
  const rate = match ? Number(match[1]) : Number.NaN;
  if (!(rate >= 0 && rate <= 100)) {
    throw new FieldError(field, `blank must be a percentage from 0 to 100, e.g. ?blank=15; got "${raw}".`);
  }
  return rate / 100;
}

/** Turns one field's type expression into something that makes values, or throws saying what is wrong. */
export function compileField({ name, type: expression }: FieldSpec): CompiledField {
  const match = EXPRESSION.exec(expression.trim());
  const type = match?.[1] ?? expression.trim();
  // `date.between` needs its arguments, so it is known only with them.
  const known = type === 'pick' || registry.has(type) || (match?.[2] !== undefined && type in ARGUMENTS);
  if (!match || !known) {
    throw new SchemaError(`Unknown generator type "${expression}". See GET /generators.`);
  }
  const [, , args, blankText] = match;
  const blank = compileBlank(name, blankText);
  let make: CompiledField['make'];
  if (type === 'pick') {
    const choose = compilePick(name, args);
    make = ({ faker }) => choose(faker);
  } else if (args !== undefined) {
    const values = compileArguments(name, type, args);
    const spec = ARGUMENTS[type] as ArgumentSpec;
    make = (locale, context) => {
      try {
        return spec.call(locale.faker, values, context);
      } catch {
        return null;
      }
    };
  } else {
    const plain = registry.get(type) as Generator;
    const safe = SAFE_GENERATORS[type];
    make = (locale, context) => (context.safe && safe ? safe(locale, context) : plain(locale));
  }
  if (blank === 0) return { name, make };
  return {
    name,
    make: (locale, context) => {
      const value = make(locale, context);
      return locale.faker.number.float() < blank ? null : value;
    },
  };
}

/** The most constraints one schema may state. */
export const MAX_CONSTRAINTS = 10;

/** A rule between two fields: `later` comes after `earlier`, or at the same moment when not `strict`. */
export interface Constraint {
  earlier: string;
  later: string;
  strict: boolean;
}

/** A schema ready to make records: its fields, the derivation order of its derived fields, and its constraints. */
export interface CompiledSchema {
  fields: CompiledField[];
  /** Derived fields, each after the ones it reads. */
  derived: CompiledField[];
  constraints: Constraint[];
}

const SYMBOL_CONSTRAINT = /^([A-Za-z_]\w*)\s*(>=|<=|>|<)\s*([A-Za-z_]\w*)$/;
const WORD_CONSTRAINT = /^([A-Za-z_]\w*)\s+(after|before)\s+([A-Za-z_]\w*)$/;

/** Reads one constraint, `end > start`, `end >= start`, `start < end`, `end after start` or `start before end`. */
export function parseConstraint(text: string): Constraint {
  const value = text.trim();
  const symbol = SYMBOL_CONSTRAINT.exec(value);
  const word = symbol ? null : WORD_CONSTRAINT.exec(value);
  const match = symbol ?? word;
  if (!match) {
    throw new SchemaError(
      `Constraint "${value}" should look like end>start, end>=start, start<end or "end after start" (two field names).`,
    );
  }
  const [, left = '', op = '', right = ''] = match;
  const greater = op === '>' || op === '>=' || op === 'after';
  return {
    later: greater ? left : right,
    earlier: greater ? right : left,
    strict: op !== '>=' && op !== '<=',
  };
}

/** Splits the query form, `end>start,total>=subtotal`, into constraints. */
export function parseConstraintList(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function compileConstraints(texts: readonly string[], plain: ReadonlySet<string>, derived: ReadonlySet<string>) {
  if (texts.length > MAX_CONSTRAINTS) throw new SchemaError(`Provide at most ${MAX_CONSTRAINTS} constraints.`);
  const constraints = texts.map(parseConstraint);
  for (const constraint of constraints) {
    for (const name of [constraint.earlier, constraint.later]) {
      if (derived.has(name)) {
        throw new SchemaError(
          `Constraint on "${name}": it is a derived field. Constrain the fields it is worked out from instead.`,
        );
      }
      if (!plain.has(name)) throw new SchemaError(`Constraint names "${name}", which is not a field of this schema.`);
    }
    if (constraint.earlier === constraint.later) {
      throw new SchemaError(`Constraint cannot compare "${constraint.earlier}" with itself.`);
    }
  }
  // A loop (a before b, b before a) cannot be satisfied, whatever the values.
  const after = new Map<string, string[]>();
  for (const { earlier, later } of constraints) after.set(earlier, [...(after.get(earlier) ?? []), later]);
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (name: string): void => {
    if (done.has(name)) return;
    if (visiting.has(name)) throw new SchemaError(`The constraints contradict each other around "${name}".`);
    visiting.add(name);
    for (const next of after.get(name) ?? []) visit(next);
    visiting.delete(name);
    done.add(name);
  };
  for (const name of after.keys()) visit(name);
  return constraints;
}

/** How `a` and `b` compare when both are numbers, dates or text: negative, zero or positive; otherwise null. */
function order(a: unknown, b: unknown): number | null {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return null;
}

/** The nearest value after `value` that can still differ from it: a day on, one on, or a hundredth on. */
function nudge(value: unknown): unknown {
  if (value instanceof Date) return new Date(value.getTime() + 86_400_000);
  if (typeof value === 'number') return Number.isInteger(value) ? value + 1 : Math.round((value + 0.01) * 1e10) / 1e10;
  return value;
}

/**
 * Makes a record keep its constraints by putting the two values in order (swapping them), and moving the later one
 * on when a strict constraint finds them equal. Values that are blank or of different kinds are left alone. The
 * constraints cannot form a loop, so a few passes settle them all.
 */
export function applyConstraints(record: Record<string, unknown>, constraints: readonly Constraint[]): void {
  for (let pass = 0; pass <= constraints.length; pass++) {
    let moved = false;
    for (const { earlier, later, strict } of constraints) {
      const first = record[earlier];
      const second = record[later];
      const by = order(first, second);
      if (by === null) continue;
      if (by > 0) {
        record[earlier] = second;
        record[later] = first;
        moved = true;
      } else if (by === 0 && strict && nudge(second) !== second) {
        record[later] = nudge(second);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** Checks a field list, throwing a SchemaError or FieldError that describes the first problem. */
export function validateFields(fields: readonly FieldSpec[], constraints: readonly string[] = []): FieldSpec[] {
  compileSchema(fields, constraints);
  return [...fields];
}

const PLAIN_NAME = /^[A-Za-z_]\w*$/;

/** Checks a field list and compiles every field. */
export function compileFields(fields: readonly FieldSpec[]): CompiledField[] {
  const { fields: compiled, derived } = compileSchema(fields);
  const byName = new Map([...compiled, ...derived].map((field) => [field.name, field]));
  return fields.map((field) => byName.get(field.name) as CompiledField);
}

/**
 * Checks a field list and its constraints and compiles them. Derived fields (`age:=age(born)`) are checked here
 * too: an expression that cannot be read, that names a field the schema does not have, or that depends on itself,
 * throws a `SchemaError` before any record is made.
 */
export function compileSchema(fields: readonly FieldSpec[], constraints: readonly string[] = []): CompiledSchema {
  if (fields.length === 0 || fields.length > MAX_FIELDS) {
    throw new SchemaError(`Provide between 1 and ${MAX_FIELDS} fields.`);
  }
  const seen = new Set<string>();
  for (const { name } of fields) {
    if (!FIELD_NAME.test(name)) {
      throw new SchemaError(
        `"${name}" is not a valid field name. Use letters, digits, "_" or "-", starting with a letter.`,
      );
    }
    if (name === 'index') throw new SchemaError('"index" is reserved; every record already has one.');
    if (seen.has(name)) throw new SchemaError(`"${name}" appears more than once.`);
    seen.add(name);
  }
  const isDerived = (field: FieldSpec) => field.type.trim().startsWith('=');
  const derivedNames = new Set(fields.filter(isDerived).map((field) => field.name));
  if (derivedNames.size > EXPRESSION_LIMITS.derived) {
    throw new SchemaError(`Provide at most ${EXPRESSION_LIMITS.derived} derived fields.`);
  }
  // An expression reads any field whose name is a plain identifier, and the record's `index`.
  const readable = new Set(['index', ...fields.map((field) => field.name).filter((name) => PLAIN_NAME.test(name))]);
  const compiled = new Map<string, CompiledField>();
  for (const field of fields) {
    if (!isDerived(field)) {
      compiled.set(field.name, compileField(field));
      continue;
    }
    try {
      const derive = compileExpression(field.type.trim().slice(1), readable);
      if (derive.deps.includes(field.name)) throw new ExpressionError('it reads the field it defines.');
      compiled.set(field.name, { name: field.name, make: () => null, derive });
    } catch (error) {
      if (error instanceof ExpressionError) throw new ExpressionError(`Field "${field.name}": ${error.message}`);
      throw error;
    }
  }
  // Derived fields run after the plain ones, and each after the derived fields it reads.
  const ordered: CompiledField[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (name: string, path: string[]): void => {
    const field = compiled.get(name);
    if (!field?.derive || state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      throw new ExpressionError(`Derived fields depend on each other: ${[...path, name].join(' → ')}.`);
    }
    state.set(name, 'visiting');
    for (const dep of field.derive.deps) visit(dep, [...path, name]);
    state.set(name, 'done');
    ordered.push(field);
  };
  for (const name of derivedNames) visit(name, []);
  const plain = new Set(fields.map((field) => field.name).filter((name) => !derivedNames.has(name)));
  return {
    fields: fields.map((field) => compiled.get(field.name) as CompiledField),
    derived: ordered,
    constraints: compileConstraints(constraints, plain, derivedNames),
  };
}

/**
 * Parses the compact query form `name:person.fullName,age:number.int(18,65)`. Commas inside parentheses belong
 * to the arguments; the first `:` of each field separates its name from its type.
 */
export function parseFieldList(value: string, constraints: readonly string[] = []): FieldSpec[] {
  const fields = splitFields(value).map((part) => {
    const at = part.indexOf(':');
    const name = part.slice(0, Math.max(at, 0)).trim();
    const type = part.slice(at + 1).trim();
    // A derived field's expression may hold colons of its own (a condition, a quoted text).
    if (at < 0 || !name || !type || (!type.startsWith('=') && /:/.test(type.replace(/\(.*\)/s, '')))) {
      throw new SchemaError(`"${part}" should look like name:module.method.`);
    }
    return { name, type };
  });
  return validateFields(fields, constraints);
}

/**
 * Builds records from a field list. With `locale=global` each record draws every field from its own locale.
 * With `safe`, contact details, addresses and pictures come from the safe ranges, and any email inside a longer
 * text is moved to an example domain. Constraints put pairs of fields in order, and derived fields are worked out
 * last, from the values the others ended with. Neither draws from the seed, so adding them leaves every other
 * field's values as they were.
 */
export function generateRecords(
  fields: readonly FieldSpec[],
  count: number,
  seed: number,
  locale: Locale = DEFAULT_LOCALE,
  context: GenerateContext = UNSAFE,
  constraints: readonly string[] = [],
): Record<string, unknown>[] {
  const schema = compileSchema(fields, constraints);
  const keep = (value: unknown) => (context.safe && typeof value === 'string' ? safeEmailsIn(value) : value);
  // Faker measures `date.past`, `date.birthdate` and the like from the moment it is asked, down to the
  // millisecond, so two requests a moment apart would differ. Every one measures from the start of today (UTC) instead,
  // the same day `today()` gives, so a seed gives the same dates all day and an `age` fits its birth date.
  const reference = startOfToday();
  const touched = new Set<CountryLocale>();
  const make = (source: CountryLocale, index: number) => {
    if (!touched.has(source)) {
      source.faker.setDefaultRefDate(reference);
      touched.add(source);
    }
    const record: Record<string, unknown> = { index };
    for (const field of schema.fields) record[field.name] = field.derive ? null : keep(field.make(source, context));
    if (schema.constraints.length > 0) applyConstraints(record, schema.constraints);
    for (const field of schema.derived) record[field.name] = keep((field.derive as CompiledExpression).run(record));
    return record;
  };
  try {
    return build({ default: make }, count, seed, locale);
  } finally {
    // The Fakers are shared with the datasets, which measure from the clock as they always did.
    for (const source of touched) source.faker.setDefaultRefDate();
  }
}
