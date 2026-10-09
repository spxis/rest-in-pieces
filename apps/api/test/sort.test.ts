import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseSort, sortRecords } from '../src/lib/sort.ts';

const SORT_MODULE = new URL('../src/lib/sort.ts', import.meta.url).href;

// Case, accents, half-width and full-width kana, and numbers in text: the strings host collations disagree on.
const WORDS = ['b', 'B', 'a', 'A', 'é', 'e', 'Z', 'z', '_x', 'ｱ', 'ア', 'あ', 'item 10', 'item 9', 'İ', 'ß'];

/** Sorts WORDS for each data locale in a fresh Node process whose host locale is `lang`. */
function sortUnderHostLocale(lang: string): string {
  const script = `
    import { parseSort, sortRecords } from ${JSON.stringify(SORT_MODULE)};
    const rows = ${JSON.stringify(WORDS)}.map((v) => ({ v }));
    const out = {};
    for (const locale of ['en-CA', 'ja']) {
      out[locale] = ['asc', 'desc'].map((d) => sortRecords(rows, parseSort('v', d), locale).map((r) => r.v));
    }
    process.stdout.write(JSON.stringify(out));
  `;
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, LANG: lang, LC_ALL: lang },
    encoding: 'utf8',
  });
}

describe('locale-aware sorting', () => {
  it('sorts the same input identically whatever the host locale', () => {
    const plain = sortUnderHostLocale('C');
    expect(sortUnderHostLocale('ja_JP.UTF-8')).toBe(plain);
    expect(sortUnderHostLocale('en_US.UTF-8')).toBe(plain);
  });

  it('orders strings by the data locale, with numbers inside text compared as numbers', () => {
    const rows = ['item 10', 'item 9', 'item 100'].map((v) => ({ v }));
    expect(sortRecords(rows, parseSort('v', undefined), 'en-CA').map((r) => r.v)).toEqual([
      'item 9',
      'item 10',
      'item 100',
    ]);
  });

  it('defaults to the default data locale', () => {
    const rows = WORDS.map((v) => ({ v }));
    expect(sortRecords(rows, parseSort('v', undefined))).toEqual(sortRecords(rows, parseSort('v', undefined), 'en-CA'));
  });

  it('makes descending the exact mirror of ascending for distinct keys', () => {
    // あ, ア and ｱ collate as equal at this sensitivity, so only one of them is a distinct key.
    const rows = WORDS.filter((v) => v !== 'ア' && v !== 'ｱ').map((v) => ({ v }));
    for (const locale of ['en-CA', 'ja'] as const) {
      const asc = sortRecords(rows, parseSort('v', 'asc'), locale).map((r) => r.v);
      const desc = sortRecords(rows, parseSort('v', 'desc'), locale).map((r) => r.v);
      expect(desc).toEqual(asc.toReversed());
    }
    const numbers = [3, 1.5, 20, -4].map((v) => ({ v }));
    expect(sortRecords(numbers, parseSort('v:numeric', 'desc')).map((r) => r.v)).toEqual([20, 3, 1.5, -4]);
  });

  it('keeps dataset order for equal keys in both directions', () => {
    const rows = [
      { id: 1, k: 'b' },
      { id: 2, k: 'a' },
      { id: 3, k: 'b' },
      { id: 4, k: 'a' },
      { id: 5, k: 'b' },
    ];
    expect(sortRecords(rows, parseSort('k', 'asc')).map((r) => r.id)).toEqual([2, 4, 1, 3, 5]);
    expect(sortRecords(rows, parseSort('k', 'desc')).map((r) => r.id)).toEqual([1, 3, 5, 2, 4]);
    expect(sortRecords(rows, parseSort('k:numeric', 'desc')).map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps dataset order without a sort field, and reverses it for descending', () => {
    const rows = WORDS.map((v) => ({ v }));
    expect(sortRecords(rows, parseSort(undefined, undefined))).toEqual(rows);
    expect(sortRecords(rows, parseSort(undefined, 'desc'))).toEqual(rows.toReversed());
  });
});
