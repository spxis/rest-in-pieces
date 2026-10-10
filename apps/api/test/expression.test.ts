import { describe, expect, it } from 'vitest';
import {
  compileExpression,
  EXPRESSION_FUNCTIONS,
  EXPRESSION_LIMITS,
  ExpressionError,
  type Value,
} from '../src/lib/expression.ts';

const run = (source: string, values: Record<string, unknown> = {}): Value =>
  compileExpression(source, new Set(Object.keys(values))).run(values);

describe('expression language', () => {
  it('does arithmetic with the usual precedence', () => {
    expect(run('1 + 2 * 3')).toBe(7);
    expect(run('(1 + 2) * 3')).toBe(9);
    expect(run('10 - 4 - 3')).toBe(3);
    expect(run('7 % 4 + 8 / 2')).toBe(7);
    expect(run('-3 + 5')).toBe(2);
    expect(run('2 * -3')).toBe(-6);
  });

  it('reads the fields it is given, and index-like names', () => {
    expect(run('price * qty', { price: 2.5, qty: 4 })).toBe(10);
    expect(run('concat(first, " ", last)', { first: 'Ada', last: 'Lovelace' })).toBe('Ada Lovelace');
    expect(run("first + '-' + n", { first: 'a', n: 3 })).toBe('a-3');
  });

  it('compares, combines and branches', () => {
    expect(run('1 < 2 && 2 <= 2')).toBe(true);
    expect(run('1 > 2 || !false')).toBe(true);
    expect(run('a == b', { a: 'x', b: 'x' })).toBe(true);
    expect(run('a != b', { a: 1, b: 2 })).toBe(true);
    expect(run("n >= 18 ? 'adult' : 'minor'", { n: 20 })).toBe('adult');
    expect(run("n >= 18 ? 'adult' : 'minor'", { n: 7 })).toBe('minor');
    expect(run("a ? 'yes' : b ? 'maybe' : 'no'", { a: null, b: 1 })).toBe('maybe');
  });

  it('gives null instead of failing when a step cannot be worked out', () => {
    expect(run('1 / 0')).toBeNull();
    expect(run('5 % 0')).toBeNull();
    expect(run("'a' - 1")).toBeNull();
    expect(run('n + 1', { n: null })).toBeNull();
    expect(run('sqrt(-1)')).toBeNull();
    expect(run('pow(10, 1000)')).toBeNull();
    expect(run('a < b', { a: 1, b: 'x' })).toBeNull();
    expect(run('round(1.234, 99)')).toBeNull();
    expect(run('date("nope")')).toBeNull();
  });

  it('has number, text and null helpers', () => {
    expect(run('round(2.675, 2)')).toBe(2.68);
    expect(run('floor(2.9) + ceil(2.1)')).toBe(5);
    expect(run('abs(-4)')).toBe(4);
    expect(run('min(3, 1, 2) + max(3, 1, 2)')).toBe(4);
    expect(run('clamp(15, 0, 10)')).toBe(10);
    expect(run('upper(s)', { s: 'ab' })).toBe('AB');
    expect(run('len("héllo")')).toBe(5);
    expect(run('substr("abcdef", 2, 3)')).toBe('cde');
    expect(run("slug('Crème Brûlée & Co.')")).toBe('creme-brulee-co');
    expect(run('pad(7, 4)')).toBe('0007');
    expect(run('coalesce(a, b, 3)', { a: null, b: null })).toBe(3);
    expect(run('isNull(a)', { a: null })).toBe(true);
  });

  it('works with dates', () => {
    const born = new Date('1990-06-15T00:00:00Z');
    expect(run("age(born, '2026-06-14')", { born })).toBe(35);
    expect(run("age(born, '2026-06-15')", { born })).toBe(36);
    expect(run("age(born, '1980-01-01')", { born })).toBeNull();
    expect(run("years('2000-02-29', '2001-02-28')")).toBe(0);
    expect(run("months('2020-01-31', '2020-03-30')")).toBe(1);
    expect(run("days('2026-01-01', '2026-01-31')")).toBe(30);
    expect(run("hours('2026-01-01T00:00:00Z', '2026-01-01T05:30:00Z')")).toBe(5);
    expect(run("dateOnly(addDays('2026-01-31', 1))")).toBe('2026-02-01');
    expect(run("dateOnly(addMonths('2026-01-31', 1))")).toBe('2026-02-28');
    expect(run("dateOnly(addYears('2024-02-29', 1))")).toBe('2025-02-28');
    expect(run('year(d) * 100 + month(d)', { d: new Date('2026-03-04T00:00:00Z') })).toBe(202603);
    expect(run('day(d)', { d: new Date('2026-03-04T00:00:00Z') })).toBe(4);
    expect(run('d < e', { d: new Date('2026-01-01'), e: new Date('2026-01-02') })).toBe(true);
    expect(run('today()')).toBeInstanceOf(Date);
    expect(run('age(born)', { born })).toBeGreaterThanOrEqual(36);
  });

  it('lists its functions', () => {
    expect(EXPRESSION_FUNCTIONS.age).toBe('age(birthDate, asOf?)');
    expect(Object.keys(EXPRESSION_FUNCTIONS).length).toBeGreaterThan(30);
  });
});

describe('expression safety', () => {
  const rejects = (source: string, fields: string[] = [], pattern?: RegExp) => {
    expect(() => compileExpression(source, new Set(fields))).toThrow(pattern ?? ExpressionError);
  };

  it('has no way to reach anything outside the record', () => {
    rejects('constructor');
    rejects('process', [], /not a field/);
    rejects('globalThis');
    rejects('require("fs")', [], /not a function/);
    rejects('eval("1")', [], /not a function/);
    rejects('Function("return 1")()', [], /not a function|unexpected/);
    rejects('toString()', [], /not a function/);
    rejects('constructor()', [], /not a function/);
    rejects('hasOwnProperty(1)', [], /not a function/);
    rejects('__proto__', [], /not a field/);
    rejects('a.b', ['a'], /unexpected/);
    rejects('a[0]', ['a'], /unexpected/);
    rejects('a => a', ['a'], /single "="|unexpected/);
    rejects('`x`', [], /unexpected/);
    rejects('a = 1', ['a'], /single "="/);
    rejects('1; 2', [], /unexpected/);
    rejects('{}', [], /unexpected/);
  });

  it('never runs a name from the record as a function, or a record value as code', () => {
    expect(run('s', { s: 'process.exit(1)' })).toBe('process.exit(1)');
    expect(run('len(s)', { s: 'eval("1")' })).toBe(9);
    expect(run('x', { x: { toString: 'no' } })).toBeNull();
  });

  it('reads errors clearly', () => {
    rejects('1 +', [], /found the end/);
    rejects('(1', [], /expected "\)"/);
    rejects('1 2', [], /unexpected "2"/);
    rejects("'open", [], /never closed/);
    rejects('1 @ 2', [], /unexpected "@"/);
    rejects('min()', [], /takes 1 to 10 arguments/);
    rejects('age(1, 2, 3)', [], /takes 1 to 2 arguments/);
    rejects('today(1)', [], /takes 0 arguments/);
    rejects('nope + 1', ['a', 'b'], /"nope" is not a field.*a, b/);
    rejects('', [], /expected a value/);
  });

  it('holds every expression to its limits', () => {
    const { source, tokens, depth, nodes } = EXPRESSION_LIMITS;
    rejects('1'.repeat(source + 1), [], /at most 400 characters/);
    rejects(Array.from({ length: tokens }, () => '1').join('+'), [], /tokens/);
    rejects(`${'('.repeat(depth + 2)}1${')'.repeat(depth + 2)}`, [], /nested at most 12/);
    rejects(`${'-'.repeat(depth + 2)}1`, [], /nested at most 12/);
    rejects(`${'abs('.repeat(depth + 2)}1${')'.repeat(depth + 2)}`, [], /nested at most 12/);
    rejects(`${'1?'.repeat(depth + 2)}1${':1'.repeat(depth + 2)}`, [], /nested at most 12/);
    rejects(Array.from({ length: nodes / 2 + 10 }, () => '1').join('+'), [], /at most 100 parts/);
    // Right at a limit still works.
    expect(run(Array.from({ length: 40 }, () => '1').join('+'))).toBe(40);
    expect(run(`${'('.repeat(depth)}1${')'.repeat(depth)}`)).toBe(1);
  });

  it('keeps the text it builds short', () => {
    const long = 'x'.repeat(900);
    expect(run('s + s', { s: long })).toBeNull();
    expect(run('concat(s, s)', { s: long })).toBeNull();
    expect(run('s + "y"', { s: long })).toHaveLength(901);
  });

  it('takes the same steps on every record, at most the number of parts', () => {
    const expression = compileExpression('a + b * c', new Set(['a', 'b', 'c']));
    for (let i = 0; i < 1000; i++) expression.run({ a: i, b: 2, c: 3 });
    expect(expression.deps.toSorted()).toEqual(['a', 'b', 'c']);
  });
});
