/**
 * Geographic features: the named seas, oceans, lakes, rivers, deserts, ranges, peninsulas and peaks of the world, from
 * `@johnmorrisdotca/chizu` (Natural Earth, public domain; names by Natural Earth and Wikidata, CC0). Chizu is an optional
 * peer dependency, like Hata: nothing here runs at start-up, the first request reads Chizu's feature files once (the world
 * and each of 238 countries, about 130 ms and 25 MB while they are read, a few hundred kilobytes kept), and without Chizu
 * `/geo/features` answers `501` and names the package to install.
 *
 * Chizu draws each map's features on that map's own canvas, with no coordinates. A world map and a country map keep how
 * the canvas was made, so a point on it is turned back into a longitude and latitude (`unprojectPoint`); the shapes
 * themselves are never served, only a point and a box.
 */
import { type Locale, localeTag } from '../lib/locale.ts';
import { type Chizu, type ChizuFeature, type ChizuMap, loadChizu } from './maps.ts';

/** Answered `501` by the API: a package this dataset is made from is not installed here. */
export class NotInstalledError extends Error {}

export const GEO_NOT_INSTALLED =
  'Geographic features are read from @johnmorrisdotca/chizu, which is not installed here: run `npm install @johnmorrisdotca/chizu` beside this package.';
export const GEO_TOO_OLD =
  'Geographic features need @johnmorrisdotca/chizu 1.2.0 or later (the version installed here has none): run `npm install @johnmorrisdotca/chizu@latest` beside this package.';

/** A named physical feature as `/geo/features` serves it. No shape is in it: only a point and a box. */
export interface FeatureRecord {
  id: string;
  wikidata: string | null;
  kind: string;
  group: string;
  name: string;
  names: { en: string; ja: string | null };
  reading: string | null;
  rank: number;
  elevation: number | null;
  location: { lat: number; lon: number };
  bbox: { west: number; south: number; east: number; north: number } | null;
  countries: string[];
  map: string | null;
}

interface Box {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** What is kept of one feature, across the maps it is on. */
interface Seen {
  feature: ChizuFeature;
  /** The longitude and latitude of its label point on the map it is largest on. */
  at: { lat: number; lon: number };
  /** The area of the box on that map, to choose between maps. */
  area: number;
  /** The box on the world map, if it is on it. */
  world: Box | null;
  /** The union of its boxes on country maps. */
  union: Box | null;
  countries: Set<string>;
  /** The country whose map shows the most of it. */
  home: { code: string; area: number } | null;
  rank: number;
}

/** The world map's own module, held in a variable so a bundler leaves it alone (the API in a browser tab has no Chizu). */
const specifier = '@johnmorrisdotca/chizu/world';
const POINT = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
const round = (value: number): number => Math.round(value * 1000) / 1000;
const GROUP_ORDER = ['marine', 'landforms', 'lakes', 'rivers', 'peaks'];

let base: readonly FeatureRecord[] | undefined;
let loading: Promise<void> | undefined;
const japanese = new Map<string, readonly FeatureRecord[]>();

const NOT_LOADED = () => new Error('Geographic features are not loaded: await loadFeatures() first.');

/**
 * The smallest box, in degrees, round a feature's drawing: every vertex of its outline turned back into a longitude and
 * latitude, and the longitudes covered by the shortest arc of the circle (the biggest gap between them is left out). A
 * feature that crosses the 180th meridian (Fiji, the Pacific) has `west` greater than `east`, as in RFC 7946; one that goes all
 * the way round has -180 and 180.
 */
function boxOf(tools: Chizu, map: ChizuMap, feature: ChizuFeature): Box | null {
  const unproject = tools.core.unprojectPoint;
  if (!unproject) return null;
  const longitudes: number[] = [];
  let south = 90;
  let north = -90;
  const take = (x: number, y: number) => {
    const at = unproject(map, x, y);
    if (!at) return;
    longitudes.push(at[0]);
    south = Math.min(south, at[1]);
    north = Math.max(north, at[1]);
  };
  if (feature.path) for (const [, x, y] of feature.path.matchAll(POINT)) take(Number(x), Number(y));
  else take(feature.centroid[0], feature.centroid[1]);
  if (longitudes.length === 0) return null;
  const arc = arcOf(longitudes);
  return { ...arc, south, north };
}

/** The shortest arc of longitudes that holds all of these: the circle less its biggest gap. */
function arcOf(values: readonly number[]): { west: number; east: number } {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const first = sorted[0] as number;
  const last = sorted[sorted.length - 1] as number;
  let gap = first + 360 - last;
  let west = first;
  let east = last;
  for (let at = 1; at < sorted.length; at += 1) {
    const here = (sorted[at] as number) - (sorted[at - 1] as number);
    if (here > gap) {
      gap = here;
      west = sorted[at] as number;
      east = sorted[at - 1] as number;
    }
  }
  // Nothing on the far side of the seam to leave out: the feature goes round the world.
  return gap < 1 ? { west: -180, east: 180 } : { west, east };
}

/** The width of a box in degrees of longitude, across the 180th meridian where it goes. */
const widthOf = (box: Box): number => (box.east >= box.west ? box.east - box.west : box.east - box.west + 360);
const areaOf = (box: Box): number => widthOf(box) * (box.north - box.south);

/** The box round two boxes: the shortest arc round the four ends of their longitudes, and the greater height. */
function unionOf(a: Box | null, b: Box): Box {
  if (!a) return b;
  const arc = arcOf([a.west, a.east, b.west, b.east]);
  // The ends of an arc that crosses the seam leave out the stretch between them; with only the ends, take the arc as wide as both.
  const wide = widthOf(a) >= widthOf(b) ? a : b;
  const merged = widthOf({ ...arc, south: 0, north: 0 }) >= widthOf(wide) ? arc : { west: wide.west, east: wide.east };
  return { ...merged, south: Math.min(a.south, b.south), north: Math.max(a.north, b.north) };
}

/**
 * Reads the world's features and each country's from Chizu, once, and joins them: a feature on several maps (a river through
 * three countries, a sea on four coasts) is one record, with every country whose map holds it. Throws `NotInstalledError` when
 * Chizu is not installed or is too old to have features.
 */
export function loadFeatures(): Promise<void> {
  loading ??= (async () => {
    const tools = await loadChizu();
    if (!tools) throw new NotInstalledError(GEO_NOT_INSTALLED);
    const { loadFeatures: layerOf, loadCountry, COUNTRY_CODES: every } = tools.load;
    if (!layerOf || !every || !tools.core.unprojectPoint) throw new NotInstalledError(GEO_TOO_OLD);
    const seen = new Map<string, Seen>();
    const read = (map: ChizuMap, feature: ChizuFeature, country: string | null) => {
      // A capital is a country's own record in `/countries`; a seat is a subdivision's in `/subdivisions`.
      if (feature.group === 'capitals') return;
      const world = country === null;
      const box = boxOf(tools, map, feature);
      const at = tools.core.unprojectPoint?.(map, feature.centroid[0], feature.centroid[1]);
      if (!box || !at) return;
      let one = seen.get(feature.code);
      if (!one) {
        one = {
          feature,
          at: { lat: at[1], lon: at[0] },
          area: -1,
          world: null,
          union: null,
          countries: new Set(),
          home: null,
          rank: feature.rank,
        };
        seen.set(feature.code, one);
      }
      const area = areaOf(box);
      one.rank = Math.min(one.rank, feature.rank);
      if (!one.feature.nameJa && feature.nameJa)
        one.feature = {
          ...one.feature,
          nameJa: feature.nameJa,
          ...(feature.reading ? { reading: feature.reading } : {}),
        };
      if (one.feature.elevation === undefined && feature.elevation !== undefined)
        one.feature = { ...one.feature, elevation: feature.elevation };
      if (world) {
        one.world = box;
        // On the world map it is whole: that is the point to give.
        one.at = { lat: at[1], lon: at[0] };
        one.area = Number.POSITIVE_INFINITY;
        return;
      }
      one.countries.add(country);
      one.union = unionOf(one.union, box);
      if (!one.home || area > one.home.area) one.home = { code: country, area };
      if (area > one.area) {
        one.area = area;
        one.at = { lat: at[1], lon: at[0] };
      }
    };
    const worldMap = (await import(/* @vite-ignore */ specifier).then(
      (module: { default: ChizuMap }) => module.default,
      () => null,
    )) as ChizuMap | null;
    const worldLayer = worldMap ? await layerOf('world') : null;
    if (worldMap && worldLayer) for (const feature of worldLayer.features) read(worldMap, feature, null);
    // Chizu also draws three places that have no ISO 3166-1 code (Ashmore and Cartier, the Indian Ocean Territories and the Siachen area): not here.
    for (const code of every.filter((one) => /^[A-Z]{2}$/.test(one))) {
      const id = code.toLowerCase();
      const [map, layer] = await Promise.all([loadCountry(id), layerOf(`country-${id}`)]);
      if (map && layer) for (const feature of layer.features) read(map, feature, code.toUpperCase());
    }
    const order = (group: string) => {
      const at = GROUP_ORDER.indexOf(group);
      return at < 0 ? GROUP_ORDER.length : at;
    };
    const records = [...seen.values()].map(recordOf);
    records.sort(
      (a, b) =>
        order(a.group) - order(b.group) || a.rank - b.rank || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1),
    );
    base = Object.freeze(records.map((one) => Object.freeze(one)));
  })();
  // A failed load is tried again by the next request (Chizu installed in the meantime is not expected, but a read can fail).
  loading.catch(() => {
    loading = undefined;
  });
  return loading;
}

function recordOf(one: Seen): FeatureRecord {
  const feature = one.feature;
  const box = one.world ?? one.union;
  const point = feature.group === 'peaks' || feature.kind === 'peak';
  const wikidata = /^Q\d+$/.test(feature.code) ? feature.code : null;
  const countries = [...one.countries].sort();
  return {
    id: feature.code,
    wikidata,
    kind: feature.kind,
    group: feature.group,
    name: feature.name,
    names: { en: feature.name, ja: feature.nameJa ?? null },
    reading: feature.reading ?? null,
    rank: one.rank,
    elevation: feature.elevation ?? null,
    location: { lat: round(one.at.lat), lon: round(one.at.lon) },
    bbox:
      point || !box
        ? null
        : { west: round(box.west), south: round(box.south), east: round(box.east), north: round(box.north) },
    countries,
    map: one.home ? `maps/${one.home.code}.svg?features=all&feature=${encodeURIComponent(feature.code)}` : null,
  };
}

/** The features, named in Japanese for `ja` (where there is a Japanese name) and in English otherwise. */
export function featureRecords(locale: Locale): readonly FeatureRecord[] {
  if (!base) throw NOT_LOADED();
  const tag = localeTag(locale) ?? '';
  if (!(tag === 'ja' || tag.startsWith('ja-'))) return base;
  let list = japanese.get('ja');
  if (!list) {
    list = Object.freeze(base.map((one) => Object.freeze({ ...one, name: one.names.ja ?? one.names.en })));
    japanese.set('ja', list);
  }
  return list;
}

/** Finds a feature by its id (a Wikidata item such as `Q200239`, or Natural Earth's `ne-…`), ignoring case. */
export function findFeature(records: readonly FeatureRecord[], id: string): FeatureRecord | undefined {
  const needle = id.trim().toLowerCase();
  return records.find((one) => one.id.toLowerCase() === needle);
}
