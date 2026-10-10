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
export interface ChizuMap {
  id: string;
  name: string;
  regions: ChizuRegion[];
}
/** One named feature as Chizu draws it on a map's canvas (a sea, a lake, a river, a landform, a peak or a capital). */
export interface ChizuFeature {
  code: string;
  kind: string;
  group: string;
  name: string;
  nameJa?: string;
  reading?: string;
  rank: number;
  elevation?: number;
  path: string;
  bbox: [number, number, number, number];
  centroid: [number, number];
}
export interface ChizuFeatureLayer {
  map: string;
  features: ChizuFeature[];
}
export interface Chizu {
  load: {
    loadCountry(code: string): Promise<ChizuMap | null>;
    loadDivisions(code: string): Promise<ChizuMap | null>;
    /** Since Chizu 1.2.0. */
    loadFeatures?(mapId: string): Promise<ChizuFeatureLayer | null>;
    FEATURE_MAPS?: readonly string[];
    COUNTRY_CODES?: readonly string[];
  };
  draw: { drawChizu(map: ChizuMap, options: Record<string, unknown>): string };
  core: {
    regionBox(map: ChizuMap, code: string, ratio?: number): unknown;
    projectPoint(map: ChizuMap, lon: number, lat: number): [number, number] | null;
    unprojectPoint?(map: ChizuMap, x: number, y: number): [number, number] | null;
  };
}

let chizu: Promise<Chizu | null> | undefined;

/** What `/maps` answers when Chizu is not installed (or cannot be loaded, as inside a browser tab). */
export const MAPS_NOT_INSTALLED =
  'Maps are drawn by @johnmorrisdotca/chizu, which is not installed here: run `npm install @johnmorrisdotca/chizu` beside this package.';

/** Chizu, when it can be imported (on Node, when it is installed beside this package), and `null` where it cannot. */
export function loadChizu(): Promise<Chizu | null> {
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
  /** Named features to draw on the map: `water`, `all`, a group (`lakes`) or a kind (`strait`), several at once. */
  features?: readonly string[] | undefined;
  /** One feature to light, by its id in `/geo/features` (`Q200239`); it is drawn even if `features` does not name it. */
  feature?: string | undefined;
}

/** What `features` may name: `water` (seas, lakes, rivers), `all`, a group, or a kind. */
export const FEATURE_CHOICES: readonly string[] = [
  'water',
  'all',
  'marine',
  'landforms',
  'lakes',
  'rivers',
  'peaks',
  'capitals',
  'ocean',
  'sea',
  'gulf',
  'bay',
  'strait',
  'channel',
  'sound',
  'fjord',
  'inlet',
  'lagoon',
  'reef',
  'lake',
  'reservoir',
  'river',
  'desert',
  'range',
  'plateau',
  'plain',
  'peninsula',
  'cape',
  'basin',
  'delta',
  'valley',
  'wetland',
  'tundra',
  'isthmus',
  'depression',
  'lowland',
  'gorge',
  'foothills',
  'peak',
  'capital',
  'seat',
];

/** A comma-separated `features` value, or the first word in it that is not a choice. */
export function parseFeatureChoices(value: string | undefined): { choices: string[] } | { bad: string } {
  const words = (value ?? '')
    .split(',')
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
  const bad = words.find((word) => !FEATURE_CHOICES.includes(word));
  return bad === undefined ? { choices: words } : { bad };
}

export type MapResult = { svg: string } | { error: string; status: 404 | 501 };

/** A colour written as 3, 6 or 8 hex digits, with or without the `#`; anything else is `null`. */
export function hexColor(value: string | undefined): string | null | undefined {
  if (value === undefined || value === '') return undefined;
  return /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? `#${value.replace(/^#/, '')}` : null;
}

/**
 * The named features to draw on a map (`features`, `feature`): Chizu's layer for the map, which holds the sea, lake, river,
 * landform and peak names that fall on it. A map with no layer, or Chizu older than 1.2, draws without; naming a feature
 * the map does not hold is `404`.
 */
async function featuresFor(
  tools: Chizu,
  mapId: string,
  options: MapOptions,
): Promise<{ draw: Record<string, unknown> } | { error: string; status: 404 }> {
  const asked = options.features && options.features.length > 0 ? options.features : undefined;
  if (!asked && !options.feature) return { draw: {} };
  const layer = tools.load.loadFeatures ? await tools.load.loadFeatures(mapId) : null;
  if (options.feature) {
    const there = layer?.features.some((one) => one.code === options.feature);
    if (!there) return { error: `The feature "${options.feature}" is not on this map.`, status: 404 };
  }
  if (!layer) return { draw: {} };
  return {
    draw: {
      features: asked ?? [],
      featureLayer: layer,
      ...(options.feature ? { tones: { [options.feature]: 'selected' } } : {}),
    },
  };
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
    const layer = await featuresFor(tools, `country-${country.alpha2.toLowerCase()}`, options);
    if ('error' in layer) return layer;
    let svg = tools.draw.drawChizu(map, { style: true, language, ...(colors ? { colors } : {}), ...layer.draw });
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
  const layer = await featuresFor(tools, `divisions-${country}`, options);
  if ('error' in layer) return layer;
  const svg = tools.draw.drawChizu(map, {
    style: true,
    language,
    box: tools.core.regionBox(map, found.code, 1.5),
    ...(colors ? { colors } : {}),
    ...layer.draw,
    tones: { [found.code]: 'selected', ...(layer.draw.tones as object | undefined) },
  });
  return { svg };
}
