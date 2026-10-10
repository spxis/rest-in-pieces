/**
 * Flags, from `@johnmorrisdotca/hata`. A record's `flag` is the address of its SVG on the jsDelivr CDN, made from a
 * list of the codes Hata has (`flagCodes.ts`), so no flag, and none of Hata's 27 MB, is in this package. `GET /flags/{code}.svg`
 * answers like `/avatars`: from Hata when it is installed beside this package, and otherwise by redirecting to the CDN,
 * which the client follows, so the server never fetches anything while a request waits.
 */
import { FLAG_CODES, HATA_VERSION } from './flagCodes.ts';

const CODES: ReadonlySet<string> = new Set(FLAG_CODES);

/** The CDN folder every flag is in: this major version of Hata, so a patch release reaches everyone and a break does not. */
export const FLAG_CDN = `https://cdn.jsdelivr.net/npm/@johnmorrisdotca/hata@${HATA_VERSION.split('.')[0]}/dist/svg`;

/** A code as Hata spells it: `jp-13`, `ca_on` and `CA-ON` are `JP-13` and `CA-ON`; anything with no flag is `null`. */
export function flagCodeOf(value: string): string | null {
  const code = value.trim().toUpperCase().replace(/_/g, '-');
  return CODES.has(code) ? code : null;
}

/** The address of a flag's SVG on the CDN, in its own proportions, or `null` where Hata has no flag for the code. */
export function flagUrlOf(code: string): string | null {
  const known = flagCodeOf(code);
  return known === null ? null : `${FLAG_CDN}/${known.toLowerCase()}.svg`;
}

/** What Hata's `/load` entry gives: a flag's SVG, framed as asked, or `null`. */
export interface HataLoader {
  flag(code: string, options?: { shape?: string; fit?: string; variant?: string }): Promise<string | null>;
}

let hata: Promise<HataLoader | null> | undefined;

/**
 * Hata, when it is installed where this package can see it, and `null` when it is not (the usual case under `npx`). The
 * name is held in a variable, so a bundler leaves it alone and the page-sized copy of this API runs without it.
 */
export function loadHata(): Promise<HataLoader | null> {
  const specifier = '@johnmorrisdotca/hata/load';
  hata ??= import(/* @vite-ignore */ specifier).then(
    (module: HataLoader) => (typeof module.flag === 'function' ? module : null),
    () => null,
  );
  return hata;
}
