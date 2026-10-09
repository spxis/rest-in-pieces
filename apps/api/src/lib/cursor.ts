/**
 * Opaque paging cursors. A cursor carries an offset and a fingerprint of the query it was issued for,
 * so following it with different filters, sort, search, seed, locale, `messy` or `max` is refused rather than
 * silently returning records from another result set.
 *
 * This module imports nothing, so the playground can build the same cursors without loading the API.
 */

export type Query = Record<string, string | undefined>;

export class CursorError extends Error {}

/** Parameters that choose a page or shape the response but leave the result set itself unchanged. */
const PAGE_AND_PRESENTATION = new Set([
  'offset',
  'limit',
  'size',
  'length',
  'page',
  'pageSize',
  'cursor',
  'metadata',
  'resultsName',
  'format',
  'delay',
  'status',
  'fail',
  'auth',
  'expand',
  'table',
]);

/** Aliases share a name in the fingerprint, in the order the API reads them. */
const ALIASES: Record<string, string[]> = {
  sortBy: ['sortBy', 'sortby', 'sortField', 'sortfield'],
  sortDirection: ['sortDirection', 'sortdirection', 'sortOrder', 'sortorder'],
  max: ['max', 'maxRecords'],
};
const ALIASED = new Set(Object.values(ALIASES).flat());

/** cyrb53: a fast 53-bit string hash. It tells queries apart; it is not a security boundary. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Identifies the result set a query describes: everything but the page and the response format. */
export function queryFingerprint(query: Query): string {
  const entries: Array<[string, string]> = [];
  for (const [name, aliases] of Object.entries(ALIASES)) {
    const value = aliases.map((alias) => query[alias]).find((v) => v !== undefined && v !== '');
    if (value !== undefined) entries.push([name, value]);
  }
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '' || PAGE_AND_PRESENTATION.has(key) || ALIASED.has(key)) continue;
    entries.push([key, value]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return hash(JSON.stringify(entries));
}

const toBase64Url = (text: string) => btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const fromBase64Url = (text: string) => atob(text.replaceAll('-', '+').replaceAll('_', '/'));

export function encodeCursor(offset: number, fingerprint: string): string {
  return toBase64Url(`1.${offset}.${fingerprint}`);
}

/** Reads a cursor, refusing one that is malformed or was issued for a different query. */
export function decodeCursor(cursor: string, fingerprint: string): number {
  let decoded: string;
  try {
    decoded = fromBase64Url(cursor);
  } catch {
    throw new CursorError('Invalid cursor. Use a nextCursor or prevCursor value from a previous response.');
  }
  const match = /^1\.(\d+)\.([0-9a-z]+)$/.exec(decoded);
  if (!match) throw new CursorError('Invalid cursor. Use a nextCursor or prevCursor value from a previous response.');
  if (match[2] !== fingerprint) {
    throw new CursorError(
      'This cursor belongs to a different query. Keep the filters, sort, q, seed, locale, messy and max the same while paging, or start again without a cursor.',
    );
  }
  return Number(match[1]);
}
