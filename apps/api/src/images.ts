/**
 * Self-hosted pictures: deterministic SVG avatars and placeholder images. Pure functions with no imports, so
 * the API serves them at `/avatars/{seed}.svg` and `/images/{w}x{h}.svg`, and the playground draws the very same
 * pictures in the page without a request. Nothing is fetched from anywhere: no proxy, no external host.
 */

/** Tile colours, dark enough for white initials and distinct on a light or a dark page.
 *
 * @example
 * ```ts
 * import { AVATAR_COLOURS } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * console.log(AVATAR_COLOURS.length, AVATAR_COLOURS[0]);
 * ```
 */
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

/** The longest text a placeholder draws, and the size range it clamps to, in pixels.
 *
 * @example
 * ```ts
 * import { PLACEHOLDER_TEXT_MAX } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * console.log(PLACEHOLDER_TEXT_MAX);
 * ```
 */
export const PLACEHOLDER_TEXT_MAX = 120;
/**
 *
 * The minimum side length of a generated placeholder image, in pixels.
 *
 * @example
 * ```ts
 * import { PLACEHOLDER_MIN } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * console.log(PLACEHOLDER_MIN);
 * ```
 */
export const PLACEHOLDER_MIN = 8;
/**
 *
 * The maximum side length of a generated placeholder image, in pixels.
 *
 * @example
 * ```ts
 * import { PLACEHOLDER_MAX } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * console.log(PLACEHOLDER_MAX);
 * ```
 */
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

/** Text made safe to place inside SVG markup.
 *
 * @param text - Text to escape for SVG content or XML attribute values.
 *
 * @returns XML-safe text with the five markup-significant characters escaped.
 *
 * @example
 * ```ts
 * import { escapeXml } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * console.log(escapeXml("<name>Ada & Grace</name>"));
 * ```
 */
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
 * (`佐藤 美穂`), and shows a family name of one or two characters whole (`佐藤`, `森`) and a longer one by its first
 * character (`長谷川` → `長`), since two characters cut from it can read as another surname; a Chinese or Korean
 * name written without a space shows its first character, the family name (`王`).
 *
 * @param name - A display name; spaced names and unspaced East Asian names follow the native initial rules.
 *
 * @returns Native display initials, including the documented family-name rules for East Asian names.
 *
 * @example
 * ```ts
 * import { initialsOf } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * console.log(initialsOf("Ada Lovelace"), initialsOf("佐藤 美穂"));
 * ```
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? '';
  if (CJK.test(first)) {
    const family = [...first];
    // Two characters cut from a longer family name can read as another surname (長谷川 → 長谷), so those show one.
    return words.length > 1 && family.length <= 2 ? family.join('') : (family[0] ?? '');
  }
  const letters = [words[0], words.length > 1 ? words[words.length - 1] : undefined]
    .map((word) => [...(word ?? '').replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '')
    .join('');
  return letters.toLocaleUpperCase();
}

/**
 * A square SVG avatar. With a name it shows the name's initials; without one, a symmetric five-by-five pattern
 * drawn from the seed. The seed alone picks the colour, so the same seed always gives the same tile.
 *
 * @param seed - A deterministic string seed for the colour and background pattern.
 *
 * @param name - Optional display name for initials; omit it for the native seed-based initials.
 *
 * @returns A complete deterministic SVG avatar document; nothing is fetched from an external image service.
 *
 * @example
 * ```ts
 * import { avatarSvg } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * console.log(avatarSvg("7", "Ada Lovelace").startsWith("<svg"));
 * ```
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

/** A colour as `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`, given with or without the `#`; `fallback` otherwise.
 *
 * @param value - A candidate three- or six-digit hexadecimal colour; undefined uses the fallback.
 *
 * @param fallback - The trusted colour returned when the candidate is absent or invalid.
 *
 * @returns A validated hexadecimal colour, or fallback when value is undefined or invalid.
 *
 * @example
 * ```ts
 * import { hexColour } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * console.log(hexColour("#2f5d4a", "#000000"), hexColour(undefined, "#000000"));
 * ```
 */
export function hexColour(value: string | undefined, fallback: string): string {
  const match = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value?.trim() ?? '');
  return match ? `#${match[1]?.toLowerCase()}` : fallback;
}

/**
 *
 * Text, background and foreground colour options for a generated SVG placeholder. Missing fields use the native image defaults.
 *
 * @example
 * ```ts
 * import { placeholderSvg, type PlaceholderOptions } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * const options: PlaceholderOptions = { text: "Test image", bg: "2f5d4a", fg: "ffffff" };
 * console.log(placeholderSvg(640, 360, options).includes("Test image"));
 * ```
 */
export interface PlaceholderOptions {
  text?: string | undefined;
  bg?: string | undefined;
  fg?: string | undefined;
}

/** Clamps a requested side to the sizes a placeholder is drawn at.
 *
 * @param value - A requested image side length to round and clamp to the supported bounds.
 *
 * @returns The rounded side length clamped between PLACEHOLDER_MIN and PLACEHOLDER_MAX.
 *
 * @example
 * ```ts
 * import { clampSide } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * console.log(clampSide(1), clampSide(5000));
 * ```
 */
export const clampSide = (value: number) =>
  Math.min(PLACEHOLDER_MAX, Math.max(PLACEHOLDER_MIN, Math.round(Number.isFinite(value) ? value : PLACEHOLDER_MIN)));

/**
 * A placeholder image: a flat rectangle with its size, or `text`, in the middle. Sizes clamp to 8–4000 pixels,
 * text to 120 characters, and colours that are not hex fall back to the defaults.
 *
 * @param width - Requested width in pixels, clamped to the supported native range.
 *
 * @param height - Requested height in pixels, clamped to the supported native range.
 *
 * @param options - Optional image text and foreground/background colours, validated by the native renderer.
 *
 * @returns A complete SVG placeholder with clamped dimensions and escaped text.
 *
 * @example
 * ```ts
 * import { placeholderSvg } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * console.log(placeholderSvg(640, 360, { text: "Test image", bg: "2f5d4a", fg: "ffffff" }).includes("Test image"));
 * ```
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

/** An SVG as a `data:` URL, for an `<img>` that should not make a request.
 *
 * @param svg - The complete SVG markup to percent-encode as a data URL.
 *
 * @returns A percent-encoded image/svg+xml data URL suitable for an image src attribute.
 *
 * @example
 * ```ts
 * import { avatarSvg, svgDataUrl } from "@johnmorrisdotca/rest-in-pieces/images";
 *
 * console.log(svgDataUrl(avatarSvg("7", "Ada Lovelace")).startsWith("data:image/svg+xml"));
 * ```
 */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
