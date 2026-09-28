import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JA_DRAFTED } from './ja.drafted.ts';
import { PHRASES, type PhraseKey } from './phrases.ts';
import { fill, placeholdersIn, speaker } from './speaker.ts';
import { resolveUiLocale } from './uiLocale.ts';

const keys = Object.keys(PHRASES) as PhraseKey[];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

describe('phrase catalogue', () => {
  it('has Japanese for every phrase, with the same placeholders and a back-translation', () => {
    for (const key of keys) {
      const ja = JA_DRAFTED[key];
      expect(ja?.text, key).toBeTruthy();
      expect(ja?.back, key).toBeTruthy();
      expect(placeholdersIn(ja.text).sort(), key).toEqual(placeholdersIn(PHRASES[key]).sort());
      expect(placeholdersIn(ja.back).sort(), key).toEqual(placeholdersIn(PHRASES[key]).sort());
    }
  });

  it('holds no phrase nothing renders', () => {
    const src = join(import.meta.dirname, '..');
    const code = sourceFiles(src)
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    const unused = keys.filter((key) => !code.includes(`'${key}'`));
    expect(unused).toEqual([]);
  });
});

describe('speaker', () => {
  it('fills placeholders and leaves unknown ones standing', () => {
    expect(fill('Page {page} of {pages}', { page: 2, pages: 5 })).toBe('Page 2 of 5');
    expect(fill('Remove {name}', {})).toBe('Remove {name}');
  });

  it('speaks each language with the same keys', () => {
    expect(speaker('en').say('app.send')).toBe('Send request');
    expect(speaker('ja').say('app.send')).toBe('リクエストを送信');
    expect(speaker('ja').say('response.page', { page: 1, pages: 3 })).toBe('1 / 3 ページ');
  });
});

describe('choosing the playground language', () => {
  const none = { search: '', stored: null, languages: [] as string[] };

  it('prefers ?lang=, then the stored choice, then the browser', () => {
    expect(resolveUiLocale({ ...none, search: '?lang=ja', stored: 'en', languages: ['en-CA'] })).toBe('ja');
    expect(resolveUiLocale({ ...none, stored: 'ja', languages: ['en-CA'] })).toBe('ja');
    expect(resolveUiLocale({ ...none, languages: ['ja-JP', 'en'] })).toBe('ja');
    expect(resolveUiLocale({ ...none, languages: ['fr-CA', 'ja'] })).toBe('ja');
    expect(resolveUiLocale({ ...none, languages: ['en-US', 'ja'] })).toBe('en');
  });

  it('falls back to English and ignores values it does not know', () => {
    expect(resolveUiLocale(none)).toBe('en');
    expect(resolveUiLocale({ ...none, search: '?lang=fr', stored: 'de' })).toBe('en');
  });
});
