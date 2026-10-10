/**
 * Checks a value against a JSON Schema or an OpenAPI schema, for the requests a mocked API receives.
 *
 * It answers with a short list of what is wrong and where, never throws for a bad value, and is bounded: a schema
 * is followed through at most `LIMITS.refs` references, at most `LIMITS.depth` levels of value, and at most
 * `LIMITS.visits` schema checks, so a hostile schema or body cannot make a request run away. It reads the same
 * subset the generator makes (`SUPPORTED` in `jsonschema.ts`), so what the mock sends back also passes here.
 *
 * Not checked, and said so in the docs: `pattern` (a pattern from a spec is never run as a regular expression, here
 * or in the generator, so none can hang the server), `format` other than the ones listed below, and the keywords
 * `jsonschema.ts` refuses at startup. `oneOf` passes when at least one branch does.
 */
import { pointer } from './jsonschema.ts';

export const LIMITS = {
  /** Errors reported; the rest are counted, not listed. */
  errors: 20,
  /** Levels of value followed. */
  depth: 64,
  /** `$ref` hops one schema may take. */
  refs: 32,
  /** Schema checks one validation may make. */
  visits: 100_000,
} as const;

export interface Violation {
  /** Where in the value: `/pets/0/name`, or `` for the value itself. */
  path: string;
  message: string;
}

export interface ValidateOptions {
  /** The value is text from a path, query or header: `"5"` is checked as an integer when the schema says so. */
  coerce?: boolean;
  /** The value is a request body: a `readOnly` property is not required of it. */
  request?: boolean;
}

type Node = { [key: string]: unknown };
const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);

const FORMATS: Record<string, (text: string) => boolean> = {
  'date-time': (text) =>
    /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.test(text) &&
    !Number.isNaN(Date.parse(text)),
  date: (text) => /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text),
  email: (text) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(text),
  uuid: (text) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text),
  ipv4: (text) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(text),
  uri: (text) => /^[a-z][a-z0-9+.-]*:\S+$/i.test(text),
};

const withArticle = (word: string) => `${/^[aeio]/i.test(word) ? 'an' : 'a'} ${word}`;

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

/** The text of a path, query or header value as the type a schema asks for, or the text again when it is not one. */
export function coerceText(text: string, types: readonly string[]): unknown {
  for (const type of types) {
    if (type === 'integer' && /^-?\d+$/.test(text)) return Number(text);
    if (type === 'number' && /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return Number(text);
    if (type === 'boolean' && (text === 'true' || text === 'false')) return text === 'true';
    if (type === 'null' && text === 'null') return null;
  }
  return text;
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The `type` a schema states, after following references, for coercing text. */
export function declaredTypes(document: unknown, schema: unknown): string[] {
  let node: unknown = schema;
  for (let hops = 0; hops <= LIMITS.refs && isNode(node); hops++) {
    if (typeof node.type === 'string') return [node.type];
    if (Array.isArray(node.type)) return node.type.filter((type): type is string => typeof type === 'string');
    if (typeof node.$ref !== 'string') return [];
    try {
      node = pointer(document, node.$ref, '');
    } catch {
      return [];
    }
  }
  return [];
}

/** What is wrong with `value` as a `schema` inside `document`, in the order found; empty when it is valid. */
export function validateValue(
  document: unknown,
  schema: unknown,
  value: unknown,
  options: ValidateOptions = {},
): Violation[] {
  const found: Violation[] = [];
  let omitted = 0;
  let visits = 0;
  const report = (path: string, message: string) => {
    if (found.length < LIMITS.errors) found.push({ path, message });
    else omitted += 1;
  };

  /** Whether one branch passes, without keeping what it found, so `anyOf` can tell a match from a miss. */
  const attempt = (check: () => void): boolean => {
    const before = found.length;
    const omittedBefore = omitted;
    check();
    const failed = found.length > before || omitted > omittedBefore;
    found.length = before;
    omitted = omittedBefore;
    return !failed;
  };

  const visit = (node: unknown, data: unknown, path: string, depth: number, hops: number): void => {
    if (++visits > LIMITS.visits || depth > LIMITS.depth) {
      report(path, 'is too deeply nested or too large to check');
      return;
    }
    if (node === true || node === undefined) return;
    if (node === false) {
      report(path, 'is not allowed');
      return;
    }
    if (!isNode(node)) return;
    if (typeof node.$ref === 'string') {
      if (hops >= LIMITS.refs) {
        report(path, 'follows more references than can be checked');
        return;
      }
      let target: unknown;
      try {
        target = pointer(document, node.$ref, '');
      } catch {
        report(path, `refers to ${node.$ref}, which is not in the document`);
        return;
      }
      visit(target, data, path, depth, hops + 1);
      const { $ref: _ref, ...rest } = node;
      if (Object.keys(rest).length > 0) visit(rest, data, path, depth, hops + 1);
      return;
    }

    let current = data;
    const declared = Array.isArray(node.type) ? node.type : typeof node.type === 'string' ? [node.type] : [];
    const types = declared.filter((type): type is string => typeof type === 'string');
    if (options.coerce && typeof current === 'string') current = coerceText(current, types);
    const nullable = node.nullable === true || types.includes('null');
    if (current === null && nullable) return;

    if (types.length > 0) {
      const actual = typeOf(current);
      const fits = types.some((type) => type === actual || (type === 'number' && actual === 'integer'));
      if (!fits) {
        const wanted = types.length === 1 ? withArticle(types[0] as string) : `one of ${types.join(', ')}`;
        report(path, `must be ${wanted}, not ${actual === 'null' ? 'null' : withArticle(actual)}`);
        return;
      }
    }
    if (Array.isArray(node.enum) && !node.enum.some((item) => equal(item, current))) {
      const shown = node.enum.slice(0, 10).map((item) => JSON.stringify(item));
      report(path, `must be one of ${shown.join(', ')}${node.enum.length > 10 ? ', …' : ''}`);
    }
    if ('const' in node && !equal(node.const, current)) report(path, `must be ${JSON.stringify(node.const)}`);

    if (Array.isArray(node.allOf)) for (const part of node.allOf) visit(part, current, path, depth + 1, hops);
    for (const key of ['anyOf', 'oneOf'] as const) {
      const branches = node[key];
      if (!Array.isArray(branches) || branches.length === 0) continue;
      if (!branches.some((branch) => attempt(() => visit(branch, current, path, depth + 1, hops)))) {
        report(path, `does not match any of the ${branches.length} ${key === 'anyOf' ? 'options' : 'alternatives'}`);
      }
    }

    if (typeof current === 'string') {
      const length = [...current].length;
      if (typeof node.minLength === 'number' && length < node.minLength) {
        report(path, `must be at least ${node.minLength} characters`);
      }
      if (typeof node.maxLength === 'number' && length > node.maxLength) {
        report(path, `must be at most ${node.maxLength} characters`);
      }
      const format = typeof node.format === 'string' ? FORMATS[node.format] : undefined;
      if (format && !format(current)) report(path, `must be ${withArticle(String(node.format))}`);
    }
    if (typeof current === 'number') {
      const exclusiveMin = node.exclusiveMinimum === true;
      const exclusiveMax = node.exclusiveMaximum === true;
      if (typeof node.minimum === 'number' && (exclusiveMin ? current <= node.minimum : current < node.minimum)) {
        report(path, `must be ${exclusiveMin ? 'more than' : 'at least'} ${node.minimum}`);
      }
      if (typeof node.maximum === 'number' && (exclusiveMax ? current >= node.maximum : current > node.maximum)) {
        report(path, `must be ${exclusiveMax ? 'less than' : 'at most'} ${node.maximum}`);
      }
      if (typeof node.exclusiveMinimum === 'number' && current <= node.exclusiveMinimum) {
        report(path, `must be more than ${node.exclusiveMinimum}`);
      }
      if (typeof node.exclusiveMaximum === 'number' && current >= node.exclusiveMaximum) {
        report(path, `must be less than ${node.exclusiveMaximum}`);
      }
      if (typeof node.multipleOf === 'number' && node.multipleOf > 0) {
        const ratio = current / node.multipleOf;
        if (Math.abs(ratio - Math.round(ratio)) > 1e-9) report(path, `must be a multiple of ${node.multipleOf}`);
      }
    }
    if (Array.isArray(current)) {
      if (typeof node.minItems === 'number' && current.length < node.minItems) {
        report(path, `must have at least ${node.minItems} items`);
      }
      if (typeof node.maxItems === 'number' && current.length > node.maxItems) {
        report(path, `must have at most ${node.maxItems} items`);
      }
      if (node.uniqueItems === true && new Set(current.map((item) => JSON.stringify(item))).size < current.length) {
        report(path, 'must not repeat an item');
      }
      const tuple = Array.isArray(node.prefixItems) ? node.prefixItems : Array.isArray(node.items) ? node.items : [];
      const each = isNode(node.items) || typeof node.items === 'boolean' ? node.items : undefined;
      for (const [index, item] of current.entries()) {
        if (found.length >= LIMITS.errors) break;
        visit(index < tuple.length ? tuple[index] : each, item, `${path}/${index}`, depth + 1, hops);
      }
    }
    if (isNode(current)) {
      const properties = isNode(node.properties) ? node.properties : {};
      if (Array.isArray(node.required)) {
        for (const name of node.required) {
          if (typeof name !== 'string' || Object.hasOwn(current, name)) continue;
          const own = properties[name];
          if (options.request && isNode(own) && own.readOnly === true) continue;
          report(`${path}/${name}`, 'is required');
        }
      }
      const size = Object.keys(current).length;
      if (typeof node.minProperties === 'number' && size < node.minProperties) {
        report(path, `must have at least ${node.minProperties} properties`);
      }
      if (typeof node.maxProperties === 'number' && size > node.maxProperties) {
        report(path, `must have at most ${node.maxProperties} properties`);
      }
      for (const [name, item] of Object.entries(current)) {
        if (found.length >= LIMITS.errors) break;
        if (Object.hasOwn(properties, name)) visit(properties[name], item, `${path}/${name}`, depth + 1, hops);
        else if (node.additionalProperties === false) report(`${path}/${name}`, 'is not allowed');
        else if (isNode(node.additionalProperties)) {
          visit(node.additionalProperties, item, `${path}/${name}`, depth + 1, hops);
        }
      }
    }
  };

  visit(schema, value, '', 0, 0);
  if (omitted > 0) found.push({ path: '', message: `and ${omitted} more` });
  return found;
}
