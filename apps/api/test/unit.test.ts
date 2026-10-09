import { describe, expect, it } from 'vitest';
import { filterRecords, parseFilters } from '../src/lib/filter.ts';
import { negotiateFormat, plain, toCsv, toXml, UnsupportedFormatError } from '../src/lib/format.ts';
import { flagParam, intParam, pick } from '../src/lib/query.ts';
import { parseSort, sortRecords } from '../src/lib/sort.ts';

describe('query helpers', () => {
  it('picks the first alias that is present and non-empty', () => {
    expect(pick({ size: '', length: '5', limit: '7' }, 'limit', 'size', 'length')).toBe('7');
    expect(pick({ size: '', length: '5' }, 'limit', 'size', 'length')).toBe('5');
    expect(pick({}, 'limit')).toBeUndefined();
  });

  it('parses non-negative integers with a fallback and a ceiling', () => {
    expect(intParam('12', 1)).toBe(12);
    expect(intParam('5000', 1, 1000)).toBe(1000);
    for (const bad of ['-1', 'abc', '1.5', undefined]) expect(intParam(bad, 3)).toBe(3);
  });

  it('reads flags', () => {
    expect(flagParam(undefined)).toBe(true);
    expect(flagParam(undefined, false)).toBe(false);
    for (const off of ['0', 'false', 'FALSE', 'no', 'off']) expect(flagParam(off)).toBe(false);
    expect(flagParam('yes')).toBe(true);
  });
});

describe('sorting', () => {
  const rows = [{ v: '10' }, { v: '9' }, { v: '100' }];

  it('compares as text by default and as numbers when asked', () => {
    const words = [{ v: 'b10' }, { v: 'a' }, { v: 'b9' }];
    expect(sortRecords(words, parseSort('v', undefined)).map((r) => r.v)).toEqual(['a', 'b9', 'b10']);
    expect(sortRecords(rows, parseSort('v:numeric', undefined)).map((r) => r.v)).toEqual(['9', '10', '100']);
  });

  it('understands every descending alias', () => {
    for (const alias of ['desc', 'descending', 'reverse', 'rev', 'backwards', '-1']) {
      expect(parseSort('v', alias).sortDirection).toBe('desc');
    }
    expect(parseSort('v', 'sideways').sortDirection).toBe('asc');
  });

  it('never mutates its input', () => {
    const copy = structuredClone(rows);
    sortRecords(rows, parseSort('v:numeric', 'desc'));
    expect(rows).toEqual(copy);
  });
});

describe('filtering', () => {
  const people = [
    { name: 'Ada', age: 36, city: 'Toronto' },
    { name: 'Grace', age: 45, city: 'Ottawa' },
    { name: 'Linus', age: 28, city: 'toronto' },
  ];
  const fields = new Set(['name', 'age', 'city']);
  const run = (query: Record<string, string>, q?: string) =>
    filterRecords(people, parseFilters(query, fields), q).map((p) => p.name);

  it('matches equality case-insensitively, with comma-separated alternatives', () => {
    expect(run({ city: 'TORONTO' })).toEqual(['Ada', 'Linus']);
    expect(run({ name: 'ada,grace' })).toEqual(['Ada', 'Grace']);
  });

  it('supports range and negation operators', () => {
    expect(run({ 'age[gte]': '36' })).toEqual(['Ada', 'Grace']);
    expect(run({ 'age[gt]': '36', 'age[lt]': '50' })).toEqual(['Grace']);
    expect(run({ 'age[lte]': '28' })).toEqual(['Linus']);
    expect(run({ 'name[ne]': 'Ada' })).toEqual(['Grace', 'Linus']);
  });

  it('ignores unknown fields, unknown operators and reserved parameters', () => {
    expect(run({ colour: 'red', 'age[between]': '1', limit: '1' })).toHaveLength(3);
  });

  it('searches every value with q', () => {
    expect(run({}, 'OTT')).toEqual(['Grace']);
    expect(run({ city: 'toronto' }, 'lin')).toEqual(['Linus']);
  });
});

describe('formats', () => {
  it('prefers ?format over Accept and rejects unknown formats', () => {
    expect(negotiateFormat('YML', 'text/csv')).toBe('yaml');
    expect(negotiateFormat(undefined, 'text/csv, */*')).toBe('csv');
    expect(negotiateFormat(undefined, 'application/x-yaml')).toBe('yaml');
    expect(negotiateFormat(undefined, 'text/xml')).toBe('xml');
    expect(negotiateFormat(undefined, '*/*')).toBe('json');
    expect(() => negotiateFormat('json5', undefined)).toThrow(UnsupportedFormatError);
  });

  it('writes RFC 4180 CSV with quoting and nested values as JSON', () => {
    const csv = toCsv([
      { a: 'plain', b: 'with, comma', c: ['x'] },
      { a: 'say "hi"', b: null, c: { d: 1 } },
    ]);
    expect(csv).toBe('a,b,c\r\nplain,"with, comma","[""x""]"\r\n"say ""hi""",,"{""d"":1}"\r\n');
  });

  it('writes XML with one root, arrays as items and safe element names', () => {
    const xml = toXml([{ '1st': 'a', tags: ['x', 'y'], 'x y': '<b>' }]);
    expect(xml).toContain('<response>\n  <item>');
    expect(xml).toContain('<_1st>a</_1st>');
    expect(xml).toContain('<tags>\n      <item>x</item>\n      <item>y</item>');
    expect(xml).toContain('<x_y>&lt;b&gt;</x_y>');
    expect(xml.match(/<response>/g)).toHaveLength(1);
  });

  it('turns dates and bigints into strings', () => {
    expect(plain({ d: new Date(0), n: 10n, list: [1n] })).toEqual({
      d: '1970-01-01T00:00:00.000Z',
      n: '10',
      list: ['1'],
    });
  });
});
