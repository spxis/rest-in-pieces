/**
 * Self-hosted pictures: deterministic SVG avatars and placeholder images. Pure functions with no imports, so
 * the API serves them at `/avatars/{seed}.svg` and `/images/{w}x{h}.svg`, and the playground draws the very same
 * pictures in the page without a request. Nothing is fetched from anywhere: no proxy, no external host.
 */

/** Tile colours, dark enough for white initials and distinct on a light or a dark page. */
export const AVATAR_COLOURS = [
  '#1e6091',
  '#2a7f62',
  '#7b3fa0',
  '#b23a48',
  '#8a5a00',
  '#33658a',
  '#5b6c1f',
  '#a33f7a',
  '#3d5a80',
  '#6d4c41',
  '#00796b',
  '#5e35b1',
] as const;

/** The longest text a placeholder draws, and the size range it clamps to, in pixels. */
export const PLACEHOLDER_TEXT_MAX = 120;
export const PLACEHOLDER_MIN = 8;
export const PLACEHOLDER_MAX = 4000;

const FONTS = `system-ui, -apple-system, 'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif`;

/** 32-bit FNV-1a with a final mix, so similar seeds still land on different colours. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Text made safe to place inside SVG markup. */
export function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  );
}

/** Characters written without spaces between words: kanji, kana and Hangul. */
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/u;

/**
 * The letters an avatar shows for a name. Latin, Cyrillic and other spaced scripts take the first letter of the
 * first and last words (`Ada Lovelace` → `AL`). A Japanese name is written family name first with a space
 * (`佐藤 美穂`), and shows its family name, up to two characters (`佐藤`); a Chinese or Korean name written
 * without a space shows its first character, the family name (`王`).
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? '';
  if (CJK.test(first)) return words.length > 1 ? [...first].slice(0, 2).join('') : ([...first][0] ?? '');
  const letters = [words[0], words.length > 1 ? words[words.length - 1] : undefined]
    .map((word) => [...(word ?? '').replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '')
    .join('');
  return letters.toLocaleUpperCase();
}

/**
 * A square SVG avatar. With a name it shows the name's initials; without one, a symmetric five-by-five pattern
 * drawn from the seed. The seed alone picks the colour, so the same seed always gives the same tile.
 */
export function avatarSvg(seed: string, name?: string): string {
  const h = hash(seed);
  const colour = AVATAR_COLOURS[h % AVATAR_COLOURS.length];
  const initials = name ? initialsOf(name) : '';
  const label = name?.trim() ? escapeXml(name.trim().slice(0, PLACEHOLDER_TEXT_MAX)) : 'Avatar';
  let inner: string;
  if (initials) {
    const wide = CJK.test(initials);
    const size = wide ? ([...initials].length > 1 ? 24 : 32) : [...initials].length > 1 ? 26 : 30;
    inner = `<text x="32" y="33" fill="#fff" font-family="${escapeXml(FONTS)}" font-size="${size}" font-weight="600" text-anchor="middle" dominant-baseline="central">${escapeXml(initials)}</text>`;
  } else {
    const cells: string[] = [];
    let bits = hash(`${seed}#pattern`);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        const on = bits & 1;
        bits = bits >>> 1 || hash(`${seed}#${row}`);
        if (!on) continue;
        for (const x of col === 2 ? [2] : [col, 4 - col]) {
          cells.push(`<rect x="${7 + x * 10}" y="${7 + row * 10}" width="10" height="10"/>`);
        }
      }
    }
    inner = `<g fill="#fff" fill-opacity="0.92">${cells.join('')}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${label}"><rect width="64" height="64" fill="${colour}"/>${inner}</svg>`;
}

/** A colour as `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`, given with or without the `#`; `fallback` otherwise. */
export function hexColour(value: string | undefined, fallback: string): string {
  const match = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value?.trim() ?? '');
  return match ? `#${match[1]?.toLowerCase()}` : fallback;
}

export interface PlaceholderOptions {
  text?: string | undefined;
  bg?: string | undefined;
  fg?: string | undefined;
}

/** Clamps a requested side to the sizes a placeholder is drawn at. */
export const clampSide = (value: number) =>
  Math.min(PLACEHOLDER_MAX, Math.max(PLACEHOLDER_MIN, Math.round(Number.isFinite(value) ? value : PLACEHOLDER_MIN)));

/**
 * A placeholder image: a flat rectangle with its size, or `text`, in the middle. Sizes clamp to 8–4000 pixels,
 * text to 120 characters, and colours that are not hex fall back to the defaults.
 */
export function placeholderSvg(width: number, height: number, { text, bg, fg }: PlaceholderOptions = {}): string {
  const w = clampSide(width);
  const h = clampSide(height);
  const caption = [...(text?.trim() || `${w}×${h}`)].slice(0, PLACEHOLDER_TEXT_MAX).join('');
  const glyphs = [...caption].reduce((sum, char) => sum + (CJK.test(char) ? 1 : 0.6), 0);
  const size = Math.max(6, Math.floor(Math.min((w * 0.9) / Math.max(glyphs, 1), h * 0.3)));
  const safe = escapeXml(caption);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${safe}"><rect width="${w}" height="${h}" fill="${hexColour(bg, '#e2e8f0')}"/><text x="${w / 2}" y="${h / 2}" fill="${hexColour(fg, '#475569')}" font-family="${escapeXml(FONTS)}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${safe}</text></svg>`;
}

/** An SVG as a `data:` URL, for an `<img>` that should not make a request. */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
