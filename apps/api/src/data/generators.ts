import type { Faker } from '@faker-js/faker';
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
}

/** Splits on commas that are not inside parentheses, so `a:pick(x,y),b:number.int(1,9)` is two fields. */
export function splitFields(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
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

/** Checks a field list, throwing a SchemaError or FieldError that describes the first problem. */
export function validateFields(fields: readonly FieldSpec[]): FieldSpec[] {
  compileFields(fields);
  return [...fields];
}

/** Checks a field list and compiles every field. */
export function compileFields(fields: readonly FieldSpec[]): CompiledField[] {
  if (fields.length === 0 || fields.length > MAX_FIELDS) {
    throw new SchemaError(`Provide between 1 and ${MAX_FIELDS} fields.`);
  }
  const seen = new Set<string>();
  return fields.map((field) => {
    const { name } = field;
    if (!FIELD_NAME.test(name)) {
      throw new SchemaError(
        `"${name}" is not a valid field name. Use letters, digits, "_" or "-", starting with a letter.`,
      );
    }
    if (name === 'index') throw new SchemaError('"index" is reserved; every record already has one.');
    if (seen.has(name)) throw new SchemaError(`"${name}" appears more than once.`);
    seen.add(name);
    return compileField(field);
  });
}

/**
 * Parses the compact query form `name:person.fullName,age:number.int(18,65)`. Commas inside parentheses belong
 * to the arguments; the first `:` of each field separates its name from its type.
 */
export function parseFieldList(value: string): FieldSpec[] {
  const fields = splitFields(value).map((part) => {
    const at = part.indexOf(':');
    const name = part.slice(0, Math.max(at, 0)).trim();
    const type = part.slice(at + 1).trim();
    if (at < 0 || !name || !type || /:/.test(type.replace(/\(.*\)/s, ''))) {
      throw new SchemaError(`"${part}" should look like name:module.method.`);
    }
    return { name, type };
  });
  return validateFields(fields);
}

/**
 * Builds records from a field list. With `locale=global` each record draws every field from its own locale.
 * With `safe`, contact details, addresses and pictures come from the safe ranges, and any email inside a longer
 * text is moved to an example domain.
 */
export function generateRecords(
  fields: readonly FieldSpec[],
  count: number,
  seed: number,
  locale: Locale = DEFAULT_LOCALE,
  context: GenerateContext = UNSAFE,
): Record<string, unknown>[] {
  const compiled = compileFields(fields);
  const make = (source: CountryLocale, index: number) => {
    const record: Record<string, unknown> = { index };
    for (const field of compiled) {
      const value = field.make(source, context);
      record[field.name] = context.safe && typeof value === 'string' ? safeEmailsIn(value) : value;
    }
    return record;
  };
  return build({ default: make }, count, seed, locale);
}
