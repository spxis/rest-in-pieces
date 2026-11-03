// Shared by the demo pages: the language and theme choices (remembered under the playground's own keys, so one choice
// covers the playground, the docs and these pages), and the words.
import { fill, WORDS } from './words.js';

const LANG_KEY = 'rest-in-pieces:ui-locale';
const THEME_KEY = 'rest-in-pieces:theme';

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage can be blocked; the choice then lasts for this page only */
  }
};

/** The language: `?lang=`, then the remembered choice, then the browser's. */
export function currentLang() {
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked === 'en' || asked === 'ja') return asked;
  const saved = read(LANG_KEY);
  if (saved === 'en' || saved === 'ja') return saved;
  return (navigator.language || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export const say = (key, values) => fill(WORDS[currentLang()][key] ?? WORDS.en[key] ?? key, values);

/** Puts the words on every element that names a key: data-say (text), data-say-label (aria-label), data-say-title (title), data-say-placeholder. */
export function applyWords(root = document) {
  document.documentElement.lang = currentLang();
  for (const [attribute, set] of [
    [
      'data-say',
      (element, text) => {
        element.textContent = text;
      },
    ],
    ['data-say-label', (element, text) => element.setAttribute('aria-label', text)],
    ['data-say-title', (element, text) => element.setAttribute('title', text)],
  ]) {
    for (const element of root.querySelectorAll(`[${attribute}]`)) set(element, say(element.getAttribute(attribute)));
  }
}

/** The theme: the remembered choice, or the system's when there is none. */
export function applyTheme() {
  const saved = read(THEME_KEY);
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  else delete document.documentElement.dataset.theme;
}

/** Wires the language and theme controls in the header. `redraw` runs after a language change. */
export function wireChrome(redraw) {
  applyTheme();
  const lang = document.getElementById('lang');
  const theme = document.getElementById('theme');
  if (lang) {
    lang.value = currentLang();
    lang.addEventListener('change', () => {
      write(LANG_KEY, lang.value);
      const url = new URL(location.href);
      url.searchParams.delete('lang');
      history.replaceState(null, '', url);
      applyWords();
      redraw?.();
    });
  }
  if (theme) {
    theme.value = read(THEME_KEY) === 'light' || read(THEME_KEY) === 'dark' ? read(THEME_KEY) : 'auto';
    theme.addEventListener('change', () => {
      if (theme.value === 'auto') {
        try {
          localStorage.removeItem(THEME_KEY);
        } catch {
          /* nothing to remove */
        }
      } else write(THEME_KEY, theme.value);
      applyTheme();
    });
  }
  applyWords();
}

/** Copies text; reports whether the browser allowed it. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
