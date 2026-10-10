/**
 * Seeded records that match a JSON Schema or an OpenAPI schema.
 *
 * `prepareSchema` reads a schema once, follows its local `$ref`s, refuses anything it cannot honour, and returns a
 * generator that draws every choice from the record's seeded Faker, so the same seed, locale and schema give the same
 * records. It supports a practical subset of JSON Schema (listed in `SUPPORTED`); a keyword it cannot honour is an
 * error that names it, never silently ignored, because a record that breaks the schema is wrong data.
 *
 * What a schema can ask for is bounded before and while anything is made: how many schema nodes it has, how deep
 * objects and arrays nest, how long arrays and strings are, how many values one record holds and how many a request
 * holds. A `$ref` must point inside the same document: no file, no URL, nothing fetched. A reference loop is either
 * cut where a property is optional and an array may be empty, or refused. This module reads no clock and fetches nothing.
 */
import type { Faker } from '@faker-js/faker';
import { build } from '../data/build.ts';
import { type CompiledField, compileField, type GenerateContext } from '../data/generators.ts';
import { startOfToday } from './expression.ts';
import type { CountryLocale, Locale } from './locale.ts';
import { type CompiledPattern, compilePattern, PatternError } from './pattern.ts';

export const SCHEMA_LIMITS = {
  /** Schema nodes reachable from the root, counting each once. */
  schemaNodes: 2000,
  /** How deep objects and arrays may nest in a record. */
  depth: 8,
  /** Values one record may hold. */
  recordNodes: 500,
  /** Values one request may produce across all its records. */
  requestNodes: 200_000,
  /** Characters one request may produce, as JSON: under the 4.5 MB body a serverless function may send. */
  requestChars: 4_000_000,
  /** The longest an array is made, and the most `minItems` may ask for. */
  items: 20,
  /** Items an array has when the schema says nothing. */
  defaultItems: 3,
  /** The longest a string is made, and the most `minLength` may ask for. */
  string: 256,
  /** Properties one object schema may list. */
  properties: 100,
  /** Values one `enum` may list. */
  enum: 500,
  /** Hops one `$ref` chain may take. */
  refs: 32,
  /** Values a generated string counts for, since a generator may make a paragraph. */
  generatorCost: 5,
} as const;

/** What the generator honours, for the docs and the OpenAPI description. */
export const SUPPORTED = {
  types: ['string', 'number', 'integer', 'boolean', 'null', 'object', 'array'],
  keywords: [
    '$ref (local only)',
    'type (one, or a list)',
    'enum',
    'const',
    'properties',
    'required',
    'items',
    'prefixItems',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minLength',
    'maxLength',
    'pattern (a subset)',
    'format',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'allOf',
    'anyOf',
    'oneOf',
    'nullable',
    'readOnly',
    'writeOnly',
    'x-generator',
  ],
  formats: ['date-time', 'date', 'time', 'email', 'uri', 'url', 'hostname', 'ipv4', 'ipv6', 'uuid', 'byte', 'password'],
} as const;

/** A schema that cannot be read, goes past a limit or asks for something this generator does not do. Answered with `400`. */
export class JsonSchemaError extends Error {}

/** Keywords that change which values are valid and that this generator does not implement. */
const UNSUPPORTED = [
  'not',
  'if',
  'then',
  'else',
  'patternProperties',
  'propertyNames',
  'contains',
  'dependentSchemas',
  'dependentRequired',
  'dependencies',
  'unevaluatedProperties',
  'unevaluatedItems',
  '$dynamicRef',
  '$recursiveRef',
] as const;

type Schema = boolean | Node;
type Node = { [key: string]: unknown };
type Value = unknown;

const OMIT = Symbol('omit');
const X_GENERATOR_COST = SCHEMA_LIMITS.generatorCost;

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);
const label = (path: string) => (path === '' ? 'the schema' : `"${path}"`);

/** Which Faker generator type a property is given when its schema is a plain string, by what it is called. */
const HINTS: Record<string, string> = {
  email: 'internet.email',
  emailaddress: 'internet.email',
  firstname: 'person.firstName',
  givenname: 'person.firstName',
  lastname: 'person.lastName',
  surname: 'person.lastName',
  familyname: 'person.lastName',
  fullname: 'person.fullName',
  name: 'person.fullName',
  username: 'internet.username',
  login: 'internet.username',
  phone: 'phone.number',
  phonenumber: 'phone.number',
  city: 'location.city',
  country: 'location.country',
  state: 'location.state',
  province: 'location.state',
  zip: 'location.zipCode',
  zipcode: 'location.zipCode',
  postalcode: 'location.zipCode',
  street: 'location.streetAddress',
  address: 'location.streetAddress',
  url: 'internet.url',
  website: 'internet.url',
  avatar: 'image.avatar',
  company: 'company.name',
  companyname: 'company.name',
  jobtitle: 'person.jobTitle',
  color: 'color.human',
  currency: 'finance.currencyCode',
  description: 'lorem.sentence',
  summary: 'lorem.sentence',
  bio: 'lorem.sentence',
  ipaddress: 'internet.ipv4',
  ip: 'internet.ipv4',
};

const FORMAT_TYPES: Record<string, string> = {
  email: 'internet.email',
  'idn-email': 'internet.email',
  uri: 'internet.url',
  url: 'internet.url',
  'uri-reference': 'internet.url',
  iri: 'internet.url',
  hostname: 'internet.domainName',
  'idn-hostname': 'internet.domainName',
  ipv4: 'internet.ipv4',
  ipv6: 'internet.ipv6',
  uuid: 'string.uuid',
  password: 'internet.password',
};

// ---- reading ------------------------------------------------------------------------------------------------

/** Follows a local `#/a/b/c` JSON pointer inside the document. */
function pointer(document: unknown, ref: string, path: string): Schema {
  if (ref === '#') return document as Schema;
  if (!ref.startsWith('#/')) {
    throw new JsonSchemaError(
      /^[a-z][a-z0-9+.-]*:|^[./]|\.json|\.ya?ml/i.test(ref)
        ? `${label(path)}: the $ref "${ref}" points outside the schema. Only local references (#/…) are followed; nothing is fetched.`
        : `${label(path)}: the $ref "${ref}" is not a local JSON pointer such as #/$defs/name or #/components/schemas/Name.`,
    );
  }
  let at: unknown = document;
  for (const raw of ref.slice(2).split('/')) {
    let part: string;
    try {
      part = decodeURIComponent(raw);
    } catch {
      throw new JsonSchemaError(`${label(path)}: the $ref "${ref}" is not valid.`);
    }
    part = part.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!(isNode(at) || Array.isArray(at)) || !Object.hasOwn(at, part)) {
      throw new JsonSchemaError(`${label(path)}: the $ref "${ref}" does not point at anything in the schema.`);
    }
    at = (at as Record<string, unknown>)[part];
  }
  if (typeof at !== 'boolean' && !isNode(at)) {
    throw new JsonSchemaError(`${label(path)}: the $ref "${ref}" does not point at a schema.`);
  }
  return at;
}

/** The tightest of two bounds. */
const tighter = (a: unknown, b: unknown, pick: (x: number, y: number) => number) =>
  typeof a === 'number' && typeof b === 'number' ? pick(a, b) : (b ?? a);

/** Two schemas as one: what `allOf` and a `$ref` with siblings mean. */
function merge(a: Node, b: Node): Node {
  const result: Node = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const before = result[key];
    if (before === undefined) result[key] = value;
    else if (key === 'properties' && isNode(before) && isNode(value)) {
      const properties: Node = { ...before };
      for (const [name, schema] of Object.entries(value)) {
        properties[name] = name in properties ? { allOf: [properties[name], schema] } : schema;
      }
      result[key] = properties;
    } else if (key === 'required' && Array.isArray(before) && Array.isArray(value)) {
      result[key] = [...new Set([...before, ...value])];
    } else if (key === 'enum' && Array.isArray(before) && Array.isArray(value)) {
      result[key] = before.filter((item) => value.some((other) => JSON.stringify(other) === JSON.stringify(item)));
    } else if (['minimum', 'minLength', 'minItems', 'exclusiveMinimum'].includes(key)) {
      result[key] = tighter(before, value, Math.max);
    } else if (['maximum', 'maxLength', 'maxItems', 'exclusiveMaximum'].includes(key)) {
      result[key] = tighter(before, value, Math.min);
    } else result[key] = value;
  }
  return result;
}

interface Source {
  document: unknown;
  /** Flattened schemas, so a schema met again for the next record is not merged again. */
  flat: WeakMap<object, Node>;
  /** How deep each schema's required structure goes, where that is known without a loop. */
  needs: WeakMap<object, number>;
}

/** Resolves `$ref`, `allOf` and the one-of choice into a single schema, leaving `oneOf` and `anyOf` for the draw. */
function flatten(source: Source, schema: Schema, path: string, hops = 0): Node {
  const known = isNode(schema) ? source.flat.get(schema) : undefined;
  if (known) return known;
  const made = flattened(source, schema, path, hops);
  if (isNode(schema)) source.flat.set(schema, made);
  return made;
}

function flattened(source: Source, schema: Schema, path: string, hops: number): Node {
  if (hops > SCHEMA_LIMITS.refs) {
    throw new JsonSchemaError(
      `${label(path)}: references or allOf nest more than ${SCHEMA_LIMITS.refs} deep, or loop on themselves.`,
    );
  }
  if (schema === true) return {};
  if (schema === false) throw new JsonSchemaError(`${label(path)}: the schema "false" allows no value.`);
  if (!isNode(schema)) throw new JsonSchemaError(`${label(path)}: a schema must be an object or a boolean.`);
  let current: Node = schema;
  if (typeof current.$ref === 'string') {
    const { $ref, ...rest } = current;
    current = merge(flatten(source, pointer(source.document, $ref, path), path, hops + 1), rest);
  } else if ('$ref' in current) throw new JsonSchemaError(`${label(path)}: $ref must be a string.`);
  if (current.allOf !== undefined) {
    if (!Array.isArray(current.allOf)) throw new JsonSchemaError(`${label(path)}: allOf must be a list of schemas.`);
    const { allOf, ...rest } = current;
    let combined: Node = {};
    for (const part of allOf as Schema[]) combined = merge(combined, flatten(source, part, path, hops + 1));
    current = flatten(source, merge(combined, rest), path, hops + 1);
  }
  return current;
}

/** The type of a flattened schema, written or implied by its keywords. */
function typesOf(node: Node): string[] {
  const written = node.type;
  if (typeof written === 'string') return [written];
  if (Array.isArray(written) && written.length > 0 && written.every((item) => typeof item === 'string')) {
    return written as string[];
  }
  if (isNode(node.properties) || node.required !== undefined) return ['object'];
  if (node.items !== undefined || node.prefixItems !== undefined) return ['array'];
  if (
    node.minLength !== undefined ||
    node.maxLength !== undefined ||
    node.pattern !== undefined ||
    node.format !== undefined
  ) {
    return ['string'];
  }
  if (
    ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'].some((key) => node[key] !== undefined)
  ) {
    return ['number'];
  }
  return [];
}

// ---- checking -----------------------------------------------------------------------------------------------

interface Caches {
  patterns: Map<string, CompiledPattern>;
  generators: Map<string, CompiledField>;
}

function number(node: Node, key: string, path: string): number | undefined {
  const value = node[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new JsonSchemaError(`${label(path)}: ${key} must be a number.`);
  }
  return value;
}

function whole(node: Node, key: string, path: string, max: number): number | undefined {
  const value = number(node, key, path);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0)
    throw new JsonSchemaError(`${label(path)}: ${key} must be a whole number of 0 or more.`);
  if (value > max)
    throw new JsonSchemaError(`${label(path)}: ${key} of ${value} is more than the ${max} this generator makes.`);
  return value;
}

/** Walks everything reachable from the root once, so every error is found before any record is made. */
function check(source: Source, root: Schema, caches: Caches): void {
  const seen = new Set<object>();
  let nodes = 0;
  const visit = (schema: Schema, path: string, hops = 0): void => {
    if (typeof schema === 'boolean') {
      if (!schema) throw new JsonSchemaError(`${label(path)}: the schema "false" allows no value.`);
      return;
    }
    if (!isNode(schema)) throw new JsonSchemaError(`${label(path)}: a schema must be an object or a boolean.`);
    if (seen.has(schema)) return;
    seen.add(schema);
    if (++nodes > SCHEMA_LIMITS.schemaNodes) {
      throw new JsonSchemaError(`a schema may have at most ${SCHEMA_LIMITS.schemaNodes} parts.`);
    }
    for (const keyword of UNSUPPORTED) {
      if (keyword in schema) {
        throw new JsonSchemaError(
          `${label(path)}: the keyword "${keyword}" is not supported. Supported: ${SUPPORTED.keywords.join(', ')}.`,
        );
      }
    }
    if (typeof schema.$ref === 'string') {
      if (hops > SCHEMA_LIMITS.refs) {
        throw new JsonSchemaError(
          `${label(path)}: references nest more than ${SCHEMA_LIMITS.refs} deep, or loop on themselves.`,
        );
      }
      visit(pointer(source.document, schema.$ref, path), schema.$ref, hops + 1);
    } else if ('$ref' in schema) throw new JsonSchemaError(`${label(path)}: $ref must be a string.`);

    const types = typesOf(schema);
    for (const type of types) {
      if (!(SUPPORTED.types as readonly string[]).includes(type)) {
        throw new JsonSchemaError(`${label(path)}: the type "${type}" is not one of ${SUPPORTED.types.join(', ')}.`);
      }
    }
    if (schema.enum !== undefined) {
      if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
        throw new JsonSchemaError(`${label(path)}: enum must be a list with at least one value.`);
      }
      if (schema.enum.length > SCHEMA_LIMITS.enum) {
        throw new JsonSchemaError(`${label(path)}: an enum may have at most ${SCHEMA_LIMITS.enum} values.`);
      }
    }
    const minLength = whole(schema, 'minLength', path, SCHEMA_LIMITS.string);
    const maxLength = whole(schema, 'maxLength', path, Number.MAX_SAFE_INTEGER);
    if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
      throw new JsonSchemaError(`${label(path)}: minLength is more than maxLength.`);
    }
    const minItems = whole(schema, 'minItems', path, SCHEMA_LIMITS.items);
    const maxItems = whole(schema, 'maxItems', path, Number.MAX_SAFE_INTEGER);
    if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
      throw new JsonSchemaError(`${label(path)}: minItems is more than maxItems.`);
    }
    const minimum = number(schema, 'minimum', path);
    const maximum = number(schema, 'maximum', path);
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      throw new JsonSchemaError(`${label(path)}: minimum is more than maximum.`);
    }
    const multiple = number(schema, 'multipleOf', path);
    if (multiple !== undefined && multiple <= 0)
      throw new JsonSchemaError(`${label(path)}: multipleOf must be more than 0.`);

    if (typeof schema.pattern === 'string' && !caches.patterns.has(schema.pattern)) {
      try {
        caches.patterns.set(schema.pattern, compilePattern(schema.pattern));
      } catch (error) {
        if (error instanceof PatternError)
          throw new JsonSchemaError(`${label(path)}: the pattern "${schema.pattern}": ${error.message}`);
        throw error;
      }
    } else if (schema.pattern !== undefined && typeof schema.pattern !== 'string') {
      throw new JsonSchemaError(`${label(path)}: pattern must be a string.`);
    }
    if (schema['x-generator'] !== undefined) cachedGenerator(caches, schema['x-generator'], path);

    if (schema.properties !== undefined) {
      if (!isNode(schema.properties)) throw new JsonSchemaError(`${label(path)}: properties must be an object.`);
      const names = Object.keys(schema.properties);
      if (names.length > SCHEMA_LIMITS.properties) {
        throw new JsonSchemaError(`${label(path)}: an object may list at most ${SCHEMA_LIMITS.properties} properties.`);
      }
      for (const name of names) visit(schema.properties[name] as Schema, `${path}/${name}`);
    }
    if (
      schema.required !== undefined &&
      !(Array.isArray(schema.required) && schema.required.every((item) => typeof item === 'string'))
    ) {
      throw new JsonSchemaError(`${label(path)}: required must be a list of property names.`);
    }
    if (Array.isArray(schema.items)) {
      for (const [i, item] of schema.items.entries()) visit(item as Schema, `${path}/items/${i}`);
    } else if (schema.items !== undefined) visit(schema.items as Schema, `${path}/items`);
    if (schema.prefixItems !== undefined) {
      if (!Array.isArray(schema.prefixItems)) throw new JsonSchemaError(`${label(path)}: prefixItems must be a list.`);
      for (const [i, item] of schema.prefixItems.entries()) visit(item as Schema, `${path}/prefixItems/${i}`);
    }
    for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
      const list = schema[key];
      if (list === undefined) continue;
      if (!Array.isArray(list) || list.length === 0) {
        throw new JsonSchemaError(`${label(path)}: ${key} must be a list with at least one schema.`);
      }
      for (const [i, item] of list.entries()) visit(item as Schema, `${path}/${key}/${i}`);
    }
  };
  visit(root, '');
}

function cachedGenerator(caches: Caches, type: unknown, path: string): CompiledField {
  if (typeof type !== 'string' || type.trim().startsWith('=')) {
    throw new JsonSchemaError(`${label(path)}: x-generator must be a generator type such as person.fullName.`);
  }
  const known = caches.generators.get(type);
  if (known) return known;
  try {
    const field = compileField({ name: 'value', type });
    caches.generators.set(type, field);
    return field;
  } catch (error) {
    throw new JsonSchemaError(
      `${label(path)}: x-generator "${type}": ${error instanceof Error ? error.message : 'cannot be used'} See GET /generators.`,
    );
  }
}

// ---- making -------------------------------------------------------------------------------------------------

interface State {
  faker: Faker;
  locale: CountryLocale;
  context: GenerateContext;
  source: Source;
  caches: Caches;
  /** Values made in the current record. */
  nodes: number;
  /** Characters those values will take as JSON, roughly: what a response is bounded by. */
  chars: number;
}

/** Whether the record so far is close to the most values one may hold. */
const crowded = (state: State) => state.nodes > SCHEMA_LIMITS.recordNodes * 0.7 || state.chars > 40_000;

const UNSATISFIABLE = 1_000_000;

/**
 * How many levels of containers a schema needs below itself when made as small as it may be: -1 for a value that is not
 * an object or an array, 0 for an empty one, and one more than the deepest required child otherwise. A loop through
 * required properties needs "more than any depth", which is how a schema that can never end is told from one that can.
 */
function need(
  source: Source,
  schema: Schema,
  path: string,
  active: Set<object> = new Set(),
  seen: { loop: boolean } = { loop: false },
  hops = 0,
): number {
  if (hops > 64) return UNSATISFIABLE;
  const node = flatten(source, schema, path);
  const known = source.needs.get(node);
  if (known !== undefined) return known;
  if (active.has(node)) {
    seen.loop = true;
    return UNSATISFIABLE;
  }
  active.add(node);
  const before = seen.loop;
  seen.loop = false;
  let result = -1;
  const branches = (node.oneOf ?? node.anyOf) as Schema[] | undefined;
  if (branches) {
    const { oneOf: _oneOf, anyOf: _anyOf, ...rest } = node;
    result = Math.max(
      ...branches.map((branch) =>
        need(source, merge(rest, flatten(source, branch, path)), path, active, seen, hops + 1),
      ),
    );
  } else {
    const types = typesOf(node);
    if (types.includes('object')) {
      const properties = isNode(node.properties) ? node.properties : {};
      const required = Array.isArray(node.required) ? (node.required as string[]) : [];
      result = Math.max(result, 0);
      for (const name of required) {
        const child = Object.hasOwn(properties, name) ? (properties[name] as Schema) : {};
        result = Math.max(result, 1 + need(source, child, `${path}/${name}`, active, seen, hops + 1));
      }
    }
    if (types.includes('array')) {
      result = Math.max(result, 0);
      const minItems = typeof node.minItems === 'number' ? node.minItems : 0;
      const prefix = Array.isArray(node.prefixItems)
        ? (node.prefixItems as Schema[])
        : Array.isArray(node.items)
          ? (node.items as Schema[])
          : [];
      const each = isNode(node.items) || typeof node.items === 'boolean' ? (node.items as Schema) : {};
      if (minItems > 0 || prefix.length > 0) {
        for (const item of prefix.slice(0, Math.max(minItems, prefix.length))) {
          result = Math.max(result, 1 + need(source, item, `${path}/items`, active, seen, hops + 1));
        }
        if (minItems > prefix.length) {
          result = Math.max(result, 1 + need(source, each, `${path}/items`, active, seen, hops + 1));
        }
      }
    }
  }
  active.delete(node);
  if (!seen.loop) source.needs.set(node, result);
  seen.loop = seen.loop || before;
  return result;
}

function boundedText(state: State, text: string, node: Node): string {
  const minLength = typeof node.minLength === 'number' ? node.minLength : 0;
  const maxLength = Math.min(
    typeof node.maxLength === 'number' ? node.maxLength : SCHEMA_LIMITS.string,
    SCHEMA_LIMITS.string,
  );
  let result = text.length > maxLength ? text.slice(0, maxLength) : text;
  if (result.length < minLength) {
    result += state.faker.string.alphanumeric(minLength - result.length);
  }
  return result;
}

function makeString(state: State, node: Node, property: string | undefined, path: string): string {
  const { faker } = state;
  const generate = (type: string) => {
    // A generator type is the caller's choice and may be a paragraph of text, so it counts for more than a number does.
    state.nodes += X_GENERATOR_COST;
    return cachedGenerator(state.caches, type, path).make(state.locale, state.context);
  };
  if (typeof node['x-generator'] === 'string') return boundedText(state, String(generate(node['x-generator'])), node);
  if (typeof node.pattern === 'string') {
    const compiled = state.caches.patterns.get(node.pattern) as CompiledPattern;
    try {
      return compiled.make(
        (n) => faker.number.int({ min: 0, max: n - 1 }),
        (steps) => {
          state.nodes += Math.ceil(steps / 10);
        },
      );
    } catch (error) {
      if (error instanceof PatternError)
        throw new JsonSchemaError(`${label(path)}: the pattern "${node.pattern}": ${error.message}`);
      throw error;
    }
  }
  const format = typeof node.format === 'string' ? node.format : undefined;
  if (format === 'date-time') return faker.date.past({ years: 3 }).toISOString();
  if (format === 'date') return faker.date.past({ years: 3 }).toISOString().slice(0, 10);
  if (format === 'time') return `${faker.date.past().toISOString().slice(11, 19)}Z`;
  if (format === 'byte') return btoa(faker.string.alphanumeric(12));
  if (format !== undefined && format in FORMAT_TYPES) {
    return boundedText(state, String(generate(FORMAT_TYPES[format] as string)), node);
  }
  const plain = node.minLength === undefined && node.maxLength === undefined;
  const hint = property === undefined ? undefined : HINTS[property.toLowerCase().replace(/[^a-z0-9]/g, '')];
  if (hint !== undefined) return boundedText(state, String(generate(hint)), node);
  const minLength = typeof node.minLength === 'number' ? node.minLength : undefined;
  const maxLength = typeof node.maxLength === 'number' ? node.maxLength : undefined;
  if (plain) return faker.lorem.words({ min: 1, max: 3 });
  const length = faker.number.int({
    min: minLength ?? Math.min(3, maxLength ?? 3),
    max: Math.min(maxLength ?? Math.max(minLength ?? 0, 12), SCHEMA_LIMITS.string),
  });
  return faker.string.alphanumeric({ length, casing: 'mixed' });
}

function makeNumber(state: State, node: Node, integer: boolean): number {
  const { faker } = state;
  const exclusiveLow = typeof node.exclusiveMinimum === 'number' ? node.exclusiveMinimum : undefined;
  const exclusiveHigh = typeof node.exclusiveMaximum === 'number' ? node.exclusiveMaximum : undefined;
  const step = typeof node.multipleOf === 'number' ? node.multipleOf : integer ? 1 : undefined;
  let low = typeof node.minimum === 'number' ? node.minimum : undefined;
  let high = typeof node.maximum === 'number' ? node.maximum : undefined;
  // Draft 4 and OpenAPI 3.0 write `exclusiveMinimum: true` beside `minimum`; later drafts write the bound itself.
  if (node.exclusiveMinimum === true && low !== undefined) low += step ?? (integer ? 1 : 0.01);
  if (node.exclusiveMaximum === true && high !== undefined) high -= step ?? (integer ? 1 : 0.01);
  if (exclusiveLow !== undefined) low = Math.max(low ?? -Infinity, exclusiveLow + (step ?? (integer ? 1 : 0.01)));
  if (exclusiveHigh !== undefined) high = Math.min(high ?? Infinity, exclusiveHigh - (step ?? (integer ? 1 : 0.01)));
  const span = integer ? 10_000 : 1000;
  const from: number = low ?? (high === undefined ? 0 : high - span);
  const to: number = high ?? (low === undefined ? span : low + span);
  if (from > to) throw new JsonSchemaError('a number schema has no value between its minimum and maximum.');
  if (step !== undefined) {
    const first = Math.ceil(from / step - 1e-9);
    const last = Math.floor(to / step + 1e-9);
    if (first > last) throw new JsonSchemaError(`no multiple of ${step} lies between ${from} and ${to}.`);
    const k = faker.number.int({ min: first, max: last });
    return Number((k * step).toFixed(10));
  }
  return Number(faker.number.float({ min: from, max: to, fractionDigits: 2 }).toFixed(2));
}

function draw(
  state: State,
  schema: Schema,
  path: string,
  depth: number,
  property: string | undefined,
  optional: boolean,
): Value | typeof OMIT {
  if (++state.nodes > SCHEMA_LIMITS.recordNodes) {
    throw new JsonSchemaError(
      `one record needs more than ${SCHEMA_LIMITS.recordNodes} values. Lower maxItems, drop properties, or ask for fewer records.`,
    );
  }
  const { faker } = state;
  let node = flatten(state.source, schema, path);
  // One of the branches: chosen by the seed, and merged over what the schema says beside it.
  for (let i = 0; node.oneOf !== undefined || node.anyOf !== undefined; i++) {
    if (i > SCHEMA_LIMITS.refs) throw new JsonSchemaError(`${label(path)}: oneOf and anyOf nest too deep.`);
    const { oneOf, anyOf, ...rest } = node;
    const branches = (oneOf ?? anyOf) as Schema[];
    const branch = branches[faker.number.int({ min: 0, max: branches.length - 1 })] as Schema;
    node = flatten(state.source, merge(rest, flatten(state.source, branch, path)), path);
  }

  if (node.const !== undefined) {
    state.chars += JSON.stringify(node.const).length;
    return node.const;
  }
  if (Array.isArray(node.enum)) {
    const chosen = node.enum[faker.number.int({ min: 0, max: node.enum.length - 1 })];
    state.chars += JSON.stringify(chosen).length;
    return chosen;
  }
  let types = typesOf(node);
  const nullable = node.nullable === true || types.includes('null');
  types = types.filter((type) => type !== 'null');
  if (nullable && (types.length === 0 || faker.datatype.boolean({ probability: 0.1 }))) return null;
  const type = types.length === 0 ? 'string' : (types[faker.number.int({ min: 0, max: types.length - 1 })] as string);

  if (type === 'string') {
    const text = makeString(state, node, property, path);
    state.chars += text.length + 2;
    return text;
  }
  state.chars += 8;
  if (type === 'integer' || type === 'number') return makeNumber(state, node, type === 'integer');
  if (type === 'boolean') return faker.datatype.boolean();

  if (type === 'object') {
    const result: Node = {};
    if (depth >= SCHEMA_LIMITS.depth) {
      if (optional) return OMIT;
      if (Array.isArray(node.required) && node.required.length > 0) {
        throw new JsonSchemaError(
          `${label(path)}: objects nest more than ${SCHEMA_LIMITS.depth} deep. A property that refers back to itself must be optional.`,
        );
      }
      return result;
    }
    const required = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);
    const properties = isNode(node.properties) ? node.properties : {};
    for (const [name, child] of Object.entries(properties)) {
      const childNode = flatten(state.source, child as Schema, `${path}/${name}`);
      if (childNode.writeOnly === true) continue;
      const mustHave = required.has(name);
      // An optional property is left out when what it would need does not fit below this depth, which is what ends a loop
      // through `$ref`, and when the record is nearly as large as one may be, so a schema that refers to itself still
      // makes a record rather than failing. A required one that does not fit is an error.
      const fits = depth + 1 + need(state.source, child as Schema, `${path}/${name}`) < SCHEMA_LIMITS.depth;
      if (!mustHave && (!fits || crowded(state) || !faker.datatype.boolean({ probability: 0.8 }))) continue;
      if (!fits) {
        throw new JsonSchemaError(
          `${label(`${path}/${name}`)}: objects nest more than ${SCHEMA_LIMITS.depth} deep. A property that refers back to itself must be optional.`,
        );
      }
      const made = draw(state, child as Schema, `${path}/${name}`, depth + 1, name, !mustHave);
      if (made !== OMIT) {
        result[name] = made;
        state.chars += name.length + 4;
      }
    }
    for (const name of required) {
      if (!(name in properties) && !(name in result))
        result[name] = draw(state, {}, `${path}/${name}`, depth + 1, name, false);
    }
    return result;
  }

  // An array.
  const prefix = Array.isArray(node.prefixItems)
    ? (node.prefixItems as Schema[])
    : Array.isArray(node.items)
      ? (node.items as Schema[])
      : [];
  const each = prefix.length > 0 && !isNode(node.items) ? ({} as Schema) : ((node.items ?? {}) as Schema);
  const minItems = typeof node.minItems === 'number' ? node.minItems : undefined;
  // With no maxItems, lists get shorter the deeper they are, so a tree does not fan out as wide as it is deep.
  const unsaid = depth <= 2 ? SCHEMA_LIMITS.defaultItems : depth <= 4 ? 2 : 1;
  const cap = Math.min(
    typeof node.maxItems === 'number' ? node.maxItems : Math.max(minItems ?? 0, unsaid),
    SCHEMA_LIMITS.items,
  );
  // Items one level down would be too deep if they, or what they require, are objects or arrays that do not fit.
  if (depth >= SCHEMA_LIMITS.depth || depth + 1 + need(state.source, each, `${path}/items`) >= SCHEMA_LIMITS.depth) {
    if (optional) return OMIT;
    if ((minItems ?? 0) > 0) {
      throw new JsonSchemaError(
        `${label(path)}: arrays nest more than ${SCHEMA_LIMITS.depth} deep. A list that refers back to itself must be allowed to be empty.`,
      );
    }
    return [];
  }
  const low = Math.min(minItems ?? (optional ? 0 : 1), cap);
  const length = Math.max(
    Math.min(prefix.length, cap),
    crowded(state) ? low : faker.number.int({ min: low, max: cap }),
  );
  const items: Value[] = [];
  const seenItems = new Set<string>();
  for (let i = 0; i < length; i++) {
    const schemaFor = i < prefix.length ? (prefix[i] as Schema) : each;
    let made: Value | typeof OMIT = OMIT;
    for (let attempt = 0; attempt < (node.uniqueItems === true ? 10 : 1); attempt++) {
      made = draw(state, schemaFor, `${path}/${i}`, depth + 1, undefined, false);
      if (node.uniqueItems !== true || !seenItems.has(JSON.stringify(made))) break;
    }
    if (made === OMIT) continue;
    if (node.uniqueItems === true) {
      const key = JSON.stringify(made);
      if (seenItems.has(key)) continue;
      seenItems.add(key);
    }
    items.push(made);
  }
  return items;
}

// ---- the public face ----------------------------------------------------------------------------------------

export interface SchemaSource {
  /** A JSON Schema. */
  schema?: unknown;
  /** An OpenAPI document (3.x or Swagger 2), with `component` naming the schema in it to use. */
  openapi?: unknown;
  component?: string | undefined;
}

export interface PreparedSchema {
  /** One value matching the schema, drawn from the locale's seeded Faker; also how many values it took. */
  make(locale: CountryLocale, context: GenerateContext): { value: Value; nodes: number; chars: number };
}

/** Reads and checks a schema. Throws `JsonSchemaError`, naming the keyword or path, before any record is made. */
export function prepareSchema({ schema, openapi, component }: SchemaSource): PreparedSchema {
  let document: unknown;
  let root: Schema;
  if (openapi !== undefined) {
    if (!isNode(openapi)) throw new JsonSchemaError('openapi must be an OpenAPI document (an object).');
    const schemas =
      isNode(openapi.components) && isNode(openapi.components.schemas)
        ? openapi.components.schemas
        : isNode(openapi.definitions)
          ? openapi.definitions
          : undefined;
    if (!schemas)
      throw new JsonSchemaError('the OpenAPI document has no components.schemas (or definitions) to generate from.');
    const names = Object.keys(schemas);
    const name = component ?? (names.length === 1 ? names[0] : undefined);
    if (name === undefined) {
      throw new JsonSchemaError(
        `name the schema to generate with "component": one of ${names.slice(0, 20).join(', ') || 'none (the document has none)'}.`,
      );
    }
    if (!Object.hasOwn(schemas, name)) {
      throw new JsonSchemaError(
        `the OpenAPI document has no schema "${name}". It has: ${names.slice(0, 20).join(', ') || 'none'}.`,
      );
    }
    document = openapi;
    root = schemas[name] as Schema;
  } else {
    if (typeof schema !== 'boolean' && !isNode(schema))
      throw new JsonSchemaError('schema must be a JSON Schema (an object).');
    document = schema;
    root = schema as Schema;
  }
  const source: Source = { document, flat: new WeakMap(), needs: new WeakMap() };
  const caches: Caches = { patterns: new Map(), generators: new Map() };
  check(source, root, caches);
  return {
    make(locale, context) {
      const state: State = { faker: locale.faker, locale, context, source, caches, nodes: 0, chars: 0 };
      const value = draw(state, root, '', 0, undefined, false);
      return { value: value === OMIT ? null : value, nodes: state.nodes, chars: state.chars };
    },
  };
}

/**
 * `count` records that match the schema. An object schema's properties become the record's fields, after `index`; any
 * other schema's value is the record's `value`. A request may produce at most `SCHEMA_LIMITS.requestNodes` values.
 * With `locale=global` each record is drawn from its own locale. Dates are measured from the start of today (UTC).
 */
export function generateFromSchema(
  prepared: PreparedSchema,
  count: number,
  seed: number,
  locale: Locale,
  context: GenerateContext,
): Record<string, unknown>[] {
  const reference = startOfToday();
  const touched = new Set<CountryLocale>();
  let total = 0;
  let written = 0;
  const make = (source: CountryLocale, index: number): Record<string, unknown> => {
    if (!touched.has(source)) {
      source.faker.setDefaultRefDate(reference);
      touched.add(source);
    }
    const { value, nodes, chars } = prepared.make(source, context);
    total += nodes;
    written += chars;
    if (written > SCHEMA_LIMITS.requestChars) {
      throw new JsonSchemaError(
        `this schema makes more than ${SCHEMA_LIMITS.requestChars.toLocaleString('en-US')} characters for ${count} records, more than a response may carry. Ask for fewer records, or use a smaller schema.`,
      );
    }
    if (total > SCHEMA_LIMITS.requestNodes) {
      throw new JsonSchemaError(
        `this schema makes more than ${SCHEMA_LIMITS.requestNodes} values for ${count} records. Ask for fewer records, or use a smaller schema.`,
      );
    }
    if (isNode(value)) {
      if ('index' in value)
        throw new JsonSchemaError('"index" is reserved; every generated record already has one. Rename that property.');
      return { index, ...value };
    }
    return { index, value };
  };
  try {
    return build({ default: make }, count, seed, locale);
  } finally {
    for (const source of touched) source.faker.setDefaultRefDate();
  }
}
