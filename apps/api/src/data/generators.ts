import { type Faker, fakerEN_CA as faker } from '@faker-js/faker';
import { fakerFor, type Locale } from '../lib/locale.ts';

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

/** Calls one Faker method on whichever locale's instance it is given. */
type Generator = (instance: Faker) => unknown;

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

function buildRegistry(): Map<string, Generator> {
  const registry = new Map<string, Generator>();
  // Faker reports deprecated methods through console.warn; those are left out rather than offered.
  const warn = console.warn;
  let deprecated = false;
  console.warn = () => {
    deprecated = true;
  };
  for (const module of MODULES) {
    const instance = faker[module] as unknown as Record<string, unknown>;
    for (const method of methodNames(instance)) {
      const type = `${module}.${method}`;
      const fn = instance[method];
      if (EXCLUDED.has(type) || typeof fn !== 'function') continue;
      const generate: Generator = (source) => {
        const target = source[module] as unknown as Record<string, () => unknown>;
        return target[method]?.call(target);
      };
      // Only methods that work without arguments are offered.
      try {
        deprecated = false;
        generate(faker);
        if (!deprecated) registry.set(type, generate);
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
  type: string;
}

export const MAX_FIELDS = 50;
export const FIELD_NAME = /^[A-Za-z_][\w-]{0,63}$/;

export class SchemaError extends Error {}

/** Checks a field list, throwing a SchemaError that describes the first problem. */
export function validateFields(fields: readonly FieldSpec[]): FieldSpec[] {
  if (fields.length === 0 || fields.length > MAX_FIELDS) {
    throw new SchemaError(`Provide between 1 and ${MAX_FIELDS} fields.`);
  }
  const seen = new Set<string>();
  for (const { name, type } of fields) {
    if (!FIELD_NAME.test(name)) {
      throw new SchemaError(
        `"${name}" is not a valid field name. Use letters, digits, "_" or "-", starting with a letter.`,
      );
    }
    if (name === 'index') throw new SchemaError('"index" is reserved; every record already has one.');
    if (seen.has(name)) throw new SchemaError(`"${name}" appears more than once.`);
    if (!registry.has(type)) throw new SchemaError(`Unknown generator type "${type}". See GET /generators.`);
    seen.add(name);
  }
  return [...fields];
}

/** Parses the compact query form `name:person.fullName,email:internet.email`. */
export function parseFieldList(value: string): FieldSpec[] {
  const fields = value.split(',').map((part) => {
    const [name, type, ...rest] = part.split(':').map((s) => s.trim());
    if (!name || !type || rest.length > 0) throw new SchemaError(`"${part}" should look like name:module.method.`);
    return { name, type };
  });
  return validateFields(fields);
}

export function generateRecords(
  fields: readonly FieldSpec[],
  count: number,
  seed: number,
  locale: Locale = 'en-CA',
): Record<string, unknown>[] {
  const source = fakerFor(locale);
  source.seed(seed);
  return Array.from({ length: count }, (_, index) => {
    const record: Record<string, unknown> = { index };
    for (const { name, type } of fields) record[name] = registry.get(type)?.(source);
    return record;
  });
}
