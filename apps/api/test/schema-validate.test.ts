import { describe, expect, it } from 'vitest';
import { coerceText, declaredTypes, LIMITS, validateValue } from '../src/lib/schemaValidate.ts';

const check = (schema: unknown, value: unknown, options = {}, document: unknown = {}) =>
  validateValue(document, schema, value, options).map((violation) => `${violation.path} ${violation.message}`);

describe('validateValue', () => {
  it('accepts a value that fits and says nothing', () => {
    expect(check({ type: 'object', required: ['a'], properties: { a: { type: 'integer' } } }, { a: 1 })).toEqual([]);
    expect(check(true, 5)).toEqual([]);
    expect(check({}, 'anything')).toEqual([]);
  });

  it('names the type, with the right article', () => {
    expect(check({ type: 'integer' }, 'x')).toEqual([' must be an integer, not a string']);
    expect(check({ type: 'string' }, 5)).toEqual([' must be a string, not an integer']);
    expect(check({ type: 'number' }, 5)).toEqual([]);
    expect(check({ type: ['string', 'null'] }, 5)).toEqual([' must be one of string, null, not an integer']);
    expect(check({ type: 'string' }, null)).toEqual([' must be a string, not null']);
    expect(check({ type: 'string', nullable: true }, null)).toEqual([]);
    expect(check({ type: 'integer' }, 1.5)).toEqual([' must be an integer, not a number']);
  });

  it('checks required properties, extra properties and nested paths', () => {
    const schema = {
      type: 'object',
      required: ['id', 'owner'],
      additionalProperties: false,
      properties: {
        id: { type: 'integer' },
        owner: { type: 'object', properties: { age: { type: 'integer', minimum: 18 } } },
      },
    };
    expect(check(schema, { owner: { age: 3 }, extra: 1 })).toEqual([
      '/id is required',
      '/owner/age must be at least 18',
      '/extra is not allowed',
    ]);
    expect(check({ additionalProperties: { type: 'integer' } }, { a: 1, b: 'x' })).toEqual([
      '/b must be an integer, not a string',
    ]);
  });

  it('does not require a readOnly property of a request body', () => {
    const schema = {
      type: 'object',
      required: ['id', 'name'],
      properties: { id: { type: 'integer', readOnly: true }, name: { type: 'string' } },
    };
    expect(check(schema, { name: 'a' }, { request: true })).toEqual([]);
    expect(check(schema, { name: 'a' })).toEqual(['/id is required']);
  });

  it('checks strings: length and the formats it knows', () => {
    expect(check({ type: 'string', minLength: 3, maxLength: 4 }, 'ab')).toEqual([' must be at least 3 characters']);
    expect(check({ type: 'string', maxLength: 2 }, 'abc')).toEqual([' must be at most 2 characters']);
    expect(check({ type: 'string', maxLength: 1 }, '😀')).toEqual([]);
    const formats: Array<[string, string, string]> = [
      ['email', 'a@b.co', 'not an email'],
      ['uuid', '3f2504e0-4f89-41d3-9a0c-0305e82c3301', '3f2504e0'],
      ['date', '2026-02-28', '2026-02-30'],
      ['date-time', '2026-10-09T12:00:00Z', 'yesterday'],
      ['ipv4', '192.0.2.1', '999.1.1.1'],
      ['uri', 'https://example.com/x', 'no scheme'],
    ];
    for (const [format, good, bad] of formats) {
      expect(check({ type: 'string', format }, good), format).toEqual([]);
      expect(check({ type: 'string', format }, bad), format).toHaveLength(1);
    }
    // A format it does not know, and a pattern, are not checked.
    expect(check({ type: 'string', format: 'phone-ish', pattern: '^\\d+$' }, 'abc')).toEqual([]);
  });

  it('checks numbers: bounds in both OpenAPI spellings, and multipleOf', () => {
    expect(check({ type: 'number', minimum: 1, maximum: 3 }, 0)).toEqual([' must be at least 1']);
    expect(check({ type: 'number', maximum: 3, exclusiveMaximum: true }, 3)).toEqual([' must be less than 3']);
    expect(check({ type: 'number', exclusiveMinimum: 3 }, 3)).toEqual([' must be more than 3']);
    expect(check({ type: 'number', minimum: 3, exclusiveMinimum: true }, 3)).toEqual([' must be more than 3']);
    expect(check({ type: 'number', multipleOf: 0.1 }, 0.3)).toEqual([]);
    expect(check({ type: 'number', multipleOf: 5 }, 12)).toEqual([' must be a multiple of 5']);
  });

  it('checks arrays: size, uniqueness, items and tuples', () => {
    expect(check({ type: 'array', minItems: 2 }, [1])).toEqual([' must have at least 2 items']);
    expect(check({ type: 'array', maxItems: 1 }, [1, 2])).toEqual([' must have at most 1 items']);
    expect(check({ type: 'array', uniqueItems: true }, [1, 1])).toEqual([' must not repeat an item']);
    expect(check({ type: 'array', items: { type: 'integer' } }, [1, 'a'])).toEqual([
      '/1 must be an integer, not a string',
    ]);
    expect(check({ prefixItems: [{ type: 'string' }, { type: 'integer' }] }, [1, 1])).toEqual([
      '/0 must be a string, not an integer',
    ]);
    expect(check({ type: 'array', items: [{ type: 'string' }] }, [1])).toEqual(['/0 must be a string, not an integer']);
  });

  it('checks enum, const, allOf, anyOf and oneOf', () => {
    expect(check({ enum: ['a', 'b'] }, 'c')).toEqual([' must be one of "a", "b"']);
    expect(check({ enum: Array.from({ length: 12 }, (_, i) => i) }, 99)[0]).toContain('…');
    expect(check({ const: 3 }, 4)).toEqual([' must be 3']);
    expect(check({ allOf: [{ type: 'object' }, { required: ['a'] }] }, {})).toEqual(['/a is required']);
    expect(check({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, true)).toEqual([
      ' does not match any of the 2 options',
    ]);
    expect(check({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 3)).toEqual([]);
    expect(check({ oneOf: [{ type: 'string' }, { type: 'integer' }] }, 'x')).toEqual([]);
    expect(check({ oneOf: [{ type: 'string' }, { type: 'integer' }] }, null)).toEqual([
      ' does not match any of the 2 alternatives',
    ]);
    expect(check(false, 1)).toEqual([' is not allowed']);
  });

  it('follows local references, with siblings, and reports one it cannot follow', () => {
    const document = { components: { schemas: { Age: { type: 'integer', minimum: 0 } } } };
    expect(check({ $ref: '#/components/schemas/Age' }, -1, {}, document)).toEqual([' must be at least 0']);
    expect(check({ $ref: '#/components/schemas/Age', maximum: 5 }, 9, {}, document)).toEqual([' must be at most 5']);
    expect(check({ $ref: '#/components/schemas/Missing' }, 1, {}, document)[0]).toContain('not in the document');
  });

  it('is bounded: a reference loop, a deep value and a wide one are stopped, not followed', () => {
    const loop = { a: { $ref: '#/b' }, b: { $ref: '#/a' } };
    expect(check({ $ref: '#/a' }, 1, {}, loop)[0]).toContain('more references than can be checked');
    let deep: unknown = 1;
    for (let i = 0; i < LIMITS.depth + 10; i++) deep = { child: deep };
    const nested: { properties?: unknown } = {};
    nested.properties = { child: nested };
    expect(check(nested, deep).some((line) => line.includes('too deeply nested'))).toBe(true);
    const many = check(
      { type: 'array', items: { type: 'string' } },
      Array.from({ length: 100 }, () => 1),
    );
    expect(many).toHaveLength(LIMITS.errors);
    const wide = check({ type: 'object', required: Array.from({ length: 50 }, (_, i) => `p${i}`) }, {});
    expect(wide).toHaveLength(LIMITS.errors + 1);
    expect(wide.at(-1)).toBe(' and 30 more');
    const anys = {
      anyOf: Array.from({ length: 1000 }, () => ({ anyOf: Array.from({ length: 1000 }, () => ({ type: 'string' })) })),
    };
    expect(check(anys, 5).length).toBeGreaterThan(0);
  });
});

describe('coerceText and declaredTypes', () => {
  it('reads text as the type asked for, and leaves what is not that type', () => {
    expect(coerceText('5', ['integer'])).toBe(5);
    expect(coerceText('5.5', ['integer'])).toBe('5.5');
    expect(coerceText('5.5', ['number'])).toBe(5.5);
    expect(coerceText('-1e3', ['number'])).toBe(-1000);
    expect(coerceText('true', ['boolean'])).toBe(true);
    expect(coerceText('yes', ['boolean'])).toBe('yes');
    expect(coerceText('null', ['null'])).toBeNull();
    expect(coerceText('7', ['string'])).toBe('7');
    expect(coerceText('7', [])).toBe('7');
  });

  it('finds the type behind a reference', () => {
    const document = { a: { $ref: '#/b' }, b: { type: ['integer', 'null'] } };
    expect(declaredTypes(document, { $ref: '#/a' })).toEqual(['integer', 'null']);
    expect(declaredTypes(document, { type: 'string' })).toEqual(['string']);
    expect(declaredTypes(document, { $ref: '#/nope' })).toEqual([]);
    expect(declaredTypes(document, 5)).toEqual([]);
  });
});
