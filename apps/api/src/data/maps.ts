/**
 * Maps, from `@johnmorrisdotca/chizu`: a country's outline, or one of its regions lit on its country, drawn as SVG by the
 * same function the package uses in a page. Chizu is an optional peer dependency, like Hata: it is loaded the first time a
 * map is asked for, each country's outline is its own small file, and nothing is drawn for a request that does not ask
 * for it. Without it installed, `/maps` answers `501` and names the package to install. The package names are held in
 * variables so a bundler leaves them alone: the copy of this API that runs inside a browser tab has no maps either, and
 * says so.
 */
import { countryRecords, findCountry, loadCountries } from './kuni.ts';

interface ChizuRegion {
  code: string;
}
interface ChizuMap {
  name: string;
  regions: ChizuRegion[];
}
interface Chizu {
  load: {
    loadCountry(code: string): Promise<ChizuMap | null>;
    loadDivisions(code: string): Promise<ChizuMap | null>;
  };
  draw: { drawChizu(map: ChizuMap, options: Record<string, unknown>): string };
  core: {
    regionBox(map: ChizuMap, code: string, ratio?: number): unknown;
    projectPoint(map: ChizuMap, lon: number, lat: number): [number, number] | null;
  };
}

let chizu: Promise<Chizu | null> | undefined;

/** What `/maps` answers when Chizu is not installed (or cannot be loaded, as inside a browser tab). */
export const MAPS_NOT_INSTALLED =
  'Maps are drawn by @johnmorrisdotca/chizu, which is not installed here: run `npm install @johnmorrisdotca/chizu` beside this package.';

/** Chizu, when it can be imported (on Node, when it is installed beside this package), and `null` where it cannot. */
function loadChizu(): Promise<Chizu | null> {
  const names = ['@johnmorrisdotca/chizu/load', '@johnmorrisdotca/chizu/draw', '@johnmorrisdotca/chizu'] as const;
  chizu ??= Promise.all(names.map((name) => import(/* @vite-ignore */ name))).then(
    ([load, draw, core]) => ({ load, draw, core }) as Chizu,
    () => null,
  );
  return chizu;
}

export interface MapOptions {
  /** A fill for the country or region, `#2f6b4f`. */
  color?: string | undefined;
  /** A dot on the capital (a country's map only: a region's projection is its own). */
  capital?: boolean | undefined;
  /** The capital's dot, `#b5452c`. */
  dot?: string | undefined;
  /** The language of the map's label for a screen reader. */
  lang?: 'en' | 'ja' | undefined;
}

export type MapResult = { svg: string } | { error: string; status: 404 | 501 };

/** A colour written as 3, 6 or 8 hex digits, with or without the `#`; anything else is `null`. */
export function hexColor(value: string | undefined): string | null | undefined {
  if (value === undefined || value === '') return undefined;
  return /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? `#${value.replace(/^#/, '')}` : null;
}

/**
 * The map for a country (`JP`, `JPN` or `392`) or a subdivision (`JP-13`, `CA-ON`). A country's is its own outline; a
 * subdivision's is its country's regions with that one lit, framed on it. Chizu has an outline for 238 countries and the
 * regions of 32, so some have none: that is `404`, with the reason.
 */
export async function mapFor(code: string, options: MapOptions = {}): Promise<MapResult> {
  const tools = await loadChizu();
  if (!tools) return { error: MAPS_NOT_INSTALLED, status: 501 };
  await loadCountries();
  const wanted = code.trim();
  const dash = wanted.indexOf('-');
  const language = options.lang ?? 'en';
  if (dash < 0) {
    const country = findCountry(countryRecords('en-CA'), wanted);
    const map = country ? await tools.load.loadCountry(country.alpha2.toLowerCase()) : null;
    if (!country || !map) return { error: `There is no map for the country "${wanted}".`, status: 404 };
    const colors = options.color ? { [country.alpha2]: options.color } : undefined;
    let svg = tools.draw.drawChizu(map, { style: true, language, ...(colors ? { colors } : {}) });
    const at = country.capitalLocation;
    const point = options.capital && at ? tools.core.projectPoint(map, at.lon, at.lat) : null;
    if (point) {
      const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
      const radius = box ? Math.max(2, Number(box[1]) * 0.012) : 6;
      const dot = `<circle class="cz-capital" cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="${radius.toFixed(1)}" fill="${options.dot ?? '#b5452c'}" stroke="#fff" stroke-width="${(radius / 3).toFixed(1)}"/>`;
      svg = svg.replace(/<\/svg>\s*$/, `${dot}</svg>`);
    }
    return { svg };
  }
  const country = wanted.slice(0, dash).toLowerCase();
  const region = wanted.slice(dash + 1);
  const map = /^[a-z]{2}$/.test(country) ? await tools.load.loadDivisions(country) : null;
  const found = map?.regions.find(
    (one) => one.code.toUpperCase() === region.toUpperCase() || one.code.toUpperCase() === wanted.toUpperCase(),
  );
  if (!map || !found) return { error: `There is no map for the subdivision "${wanted}".`, status: 404 };
  const colors = options.color ? { [found.code]: options.color } : undefined;
  const svg = tools.draw.drawChizu(map, {
    style: true,
    language,
    box: tools.core.regionBox(map, found.code, 1.5),
    tones: { [found.code]: 'selected' },
    ...(colors ? { colors } : {}),
  });
  return { svg };
}
