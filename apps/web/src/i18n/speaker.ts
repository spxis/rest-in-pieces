import { createElement, Fragment, type ReactNode } from 'react';
import { JA_DRAFTED } from './ja.drafted.ts';
import { PHRASES, type PhraseKey } from './phrases.ts';

export type UiLocale = 'en' | 'ja';
export const UI_LOCALES: ReadonlyArray<{ locale: UiLocale; endonym: string; tag: string }> = [
  { locale: 'en', endonym: 'English', tag: 'en' },
  { locale: 'ja', endonym: '日本語', tag: 'ja' },
];

type Vars = Record<string, string | number>;

/** Fills `{name}` placeholders. One nobody supplied is left standing, so a gap reads as a bug rather than as prose. */
export function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}

/** The `{placeholders}` a phrase expects, in order. */
export const placeholdersIn = (template: string) => [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);

export interface Speaker {
  locale: UiLocale;
  say(key: PhraseKey, vars?: Vars): string;
  /** Like `say`, with elements in the placeholders, so word order stays the translation's own. */
  compose(key: PhraseKey, parts: Record<string, ReactNode>): ReactNode;
}

function template(locale: UiLocale, key: PhraseKey): string {
  return locale === 'ja' ? (JA_DRAFTED[key]?.text ?? PHRASES[key]) : PHRASES[key];
}

export function speaker(locale: UiLocale): Speaker {
  return {
    locale,
    say: (key, vars) => fill(template(locale, key), vars),
    compose: (key, parts) =>
      template(locale, key)
        .split(/\{(\w+)\}/g)
        .map((piece, i) => createElement(Fragment, { key: i }, i % 2 ? (parts[piece] ?? `{${piece}}`) : piece)),
  };
}
