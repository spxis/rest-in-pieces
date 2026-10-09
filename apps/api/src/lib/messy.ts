/**
 * Messy data: rewrites a repeatable share of a dataset's values into the ones that break layouts and
 * parsers. Nulls and missing keys, empty and whitespace-only strings, very long strings, emoji, combining
 * marks and zero-width joiners, right-to-left text, stray whitespace, numbers at the edges and dates at
 * the edges.
 *
 * Which values change, and how, comes from the seed, the record's position in the dataset and the field
 * name, so `seed=1&messy=true` returns the same rows every time and a bug can be shared by URL. A larger
 * share keeps every change a smaller one made and adds more. Values keep their type: a string becomes
 * another string or null, a number another number (an integer stays an integer), a date another date in
 * the same format.
 */

import { flagParam } from './query.ts';

/** The share `messy=true` rewrites. */
export const DEFAULT_MESSY_SHARE = 0.15;

/**
 * Reads `messy`: a number from 0 to 1 is the share of values to rewrite (`1` rewrites every one), `true`
 * is the default share, and `false`, `no` or `off` turn it off. Returns 0 when off.
 */
export function parseMessy(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 0;
  const share = Number(value);
  if (Number.isFinite(share)) return Math.min(Math.max(share, 0), 1);
  return flagParam(value, false) ? DEFAULT_MESSY_SHARE : 0;
}

/** cyrb53-style 32-bit hash, the same everywhere. */
function hash(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

/** mulberry32: a tiny seeded generator, so each value draws its own short stream. */
function streamFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const choose = <T>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length)] as T;

/** Marks a value to delete from its record, so a missing key and a null can be told apart. */
const MISSING = Symbol('missing');

const WHITESPACE_ONLY = [' ', '   ', '\t', '\n', ' \t \n ', ' ', '  '];

const UNICODE = [
  '👩‍👩‍👧‍👦',
  '👨🏽‍💻',
  '🏳️‍🌈',
  '🇨🇦🇯🇵',
  '🎉🔥💯',
  'Zoe\u0308', // e followed by a combining diaeresis
  'Ñoño',
  'Z̷̢͎a̸͙l̵̰g̴̣o̶͖',
  'é̂̃̄',
  'zero​width‍space',
];

const RIGHT_TO_LEFT = [
  'مرحبا بالعالم',
  'محمد عبد الله',
  'שלום עולם',
  'דוד כהן',
  'القاهرة',
  'ירושלים',
  'Ahmed أحمد 42',
  '‮evil.exe', // a right-to-left override in front of Latin text
];

const LEADING_TRAILING = [
  (text: string) => ` ${text}`,
  (text: string) => `${text} `,
  (text: string) => `   ${text}   `,
  (text: string) => `\t${text}\n`,
  (text: string) => ` ${text} `,
];

/** Fields whose long form is a paragraph rather than a name. */
const PARAGRAPH = /desc|bio|about|body|text|content|summary|note|comment|phrase|paragraph|message/i;

/** Repeats `text` until it is exactly `length` characters (code units) long. */
function stretch(text: string, length: number): string {
  const seed = text.trim() === '' ? 'long' : text.trim();
  return seed.concat(` ${seed}`.repeat(Math.ceil(length / (seed.length + 1)))).slice(0, length);
}

type Rewrite = (random: () => number) => unknown;

function messyString(value: string, field: string): Rewrite[] {
  return [
    () => null,
    () => MISSING,
    () => '',
    (random) => choose(WHITESPACE_ONLY, random),
    () => stretch(value, PARAGRAPH.test(field) ? 2000 : 120),
    (random) => {
      const odd = choose(UNICODE, random);
      return random() < 0.5 ? odd : `${value} ${odd}`;
    },
    (random) => choose(RIGHT_TO_LEFT, random),
    (random) => choose(LEADING_TRAILING, random)(value),
  ];
}

const INTEGER_EDGES = [0, -1, -2147483648, 2147483647, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER];
const NUMBER_EDGES = [0, -1, -0.01, 1e21, Number.MAX_SAFE_INTEGER, 0.1 + 0.2, 1 / 3, 1e-7];

function messyNumber(value: number): Rewrite[] {
  const integer = Number.isInteger(value);
  const edges = integer ? INTEGER_EDGES : NUMBER_EDGES;
  return [
    () => null,
    () => MISSING,
    () => 0,
    () => (value > 0 ? -value : integer ? -1 : -0.01),
    (random) => choose(edges, random),
    ...(integer ? [] : [() => value + 0.000000001, () => value / 3]),
  ];
}

const EDGE_DATES = [
  '1970-01-01T00:00:00.000Z', // the Unix epoch
  '9999-12-31T23:59:59.999Z', // far future
  '2038-01-19T03:14:08.000Z', // one second past a signed 32-bit time_t
  '2024-02-29T00:00:00.000Z', // a leap day
  '2000-02-29T12:00:00.000Z', // a leap day in a century year
  '1900-01-01T00:00:00.000Z',
];

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function messyDate(format: (iso: string) => unknown): Rewrite[] {
  return [() => null, () => MISSING, (random) => format(choose(EDGE_DATES, random))];
}

function messyArray(value: unknown[]): Rewrite[] {
  return [
    () => null,
    () => MISSING,
    () => [],
    (random) => value.map((item) => (typeof item === 'string' ? choose(RIGHT_TO_LEFT.concat(UNICODE), random) : item)),
  ];
}

/** The rewrites that keep a value's type. Booleans and anything else can only go null or missing. */
function rewritesFor(value: unknown, field: string): Rewrite[] {
  if (typeof value === 'string') {
    if (ISO_DATE_TIME.test(value)) return messyDate((iso) => iso);
    if (ISO_DATE.test(value)) return messyDate((iso) => iso.slice(0, 10));
    return messyString(value, field);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return messyNumber(value);
  if (value instanceof Date) return messyDate((iso) => new Date(iso));
  if (Array.isArray(value)) return messyArray(value);
  return [() => null, () => MISSING];
}

export interface MessyOptions {
  /** Share of values to rewrite, 0 to 1. */
  share: number;
  seed: number;
  /** Fields left alone, such as the id a record is looked up by. */
  keep?: readonly string[];
}

/** Rewrites one record. `index` is its position in the whole dataset, so paging and filters do not move it. */
export function messyRecord<T extends object>(record: T, index: number, { share, seed, keep = [] }: MessyOptions): T {
  if (share <= 0) return record;
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(record)) {
    if (value === null || value === undefined || keep.includes(field)) {
      out[field] = value;
      continue;
    }
    const random = streamFrom(hash(`${seed}:${index}:${field}`));
    if (random() >= share) {
      out[field] = value;
      continue;
    }
    const messy = choose(rewritesFor(value, field), random)(random);
    if (messy !== MISSING) out[field] = messy;
  }
  return out as T;
}

/** Rewrites a whole dataset, or returns it untouched when `share` is 0. */
export function messyRecords<T extends object>(records: readonly T[], options: MessyOptions): readonly T[] {
  if (options.share <= 0) return records;
  return records.map((record, index) => messyRecord(record, index, options));
}
