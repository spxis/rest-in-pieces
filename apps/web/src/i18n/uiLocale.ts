import type { UiLocale } from './speaker.ts';

export const LANG_PARAM = 'lang';
export const LANG_STORAGE_KEY = 'rest-in-pieces:lang';

const asLocale = (value: string | null | undefined): UiLocale | null =>
  value === 'en' || value === 'ja' ? value : null;

/**
 * The language to draw the playground in: `?lang=` first, then the reader's last choice,
 * then the browser's own list, where any `ja` tag counts. English when none of them says.
 */
export function resolveUiLocale({
  search,
  stored,
  languages,
}: {
  search: string;
  stored: string | null;
  languages: readonly string[];
}): UiLocale {
  const asked = asLocale(new URLSearchParams(search).get(LANG_PARAM));
  if (asked) return asked;
  const remembered = asLocale(stored);
  if (remembered) return remembered;
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'ja') return 'ja';
    if (base === 'en') return 'en';
  }
  return 'en';
}

export function readStoredLocale(): string | null {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeLocale(locale: UiLocale) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, locale);
  } catch {
    // Private windows can refuse storage; the choice then lasts for this visit only.
  }
}
