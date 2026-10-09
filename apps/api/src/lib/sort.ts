import { DEFAULT_LOCALE, type Locale, localeTag } from './locale.ts';

export type SortDirection = 'asc' | 'desc';
export type SortType = 'string' | 'numeric';

export interface SortOptions {
  sortBy: string | null;
  sortType: SortType;
  sortDirection: SortDirection;
}

const DESCENDING = new Set(['desc', 'descending', 'backwards', 'rev', 'reverse', '-1']);
const NUMERIC = new Set(['int', 'integer', 'num', 'number', 'numeric', 'double', 'float']);

/**
 * Reads `sortBy` and `sortDirection`. A type hint can be appended to the field,
 * e.g. `sortBy=postal:string` or `sortBy=age:numeric`.
 */
export function parseSort(sortBy: string | undefined, sortDirection: string | undefined): SortOptions {
  const match = sortBy ? /^\s*([\w-]+)\s*(?::([\w-]*))?\s*$/.exec(sortBy) : null;
  const field = match?.[1] ?? sortBy ?? null;
  const type = match?.[2]?.toLowerCase();

  return {
    sortBy: field,
    sortType: type && NUMERIC.has(type) ? 'numeric' : 'string',
    sortDirection: sortDirection && DESCENDING.has(sortDirection.toLowerCase()) ? 'desc' : 'asc',
  };
}

const collators = new Map<string, Intl.Collator>();

/**
 * One collator per data locale. Naming the locale keeps the order independent of the host's
 * default locale; `numeric` puts `9` before `10`, and `variant` sensitivity separates case and accents.
 */
function collatorFor(locale: Locale): Intl.Collator {
  let collator = collators.get(locale);
  if (!collator) {
    // `global` mixes languages and is not a language tag; its order is the default locale's.
    const tag = localeTag(locale) ?? localeTag(DEFAULT_LOCALE);
    collator = new Intl.Collator(tag, { numeric: true, sensitivity: 'variant' });
    collators.set(locale, collator);
  }
  return collator;
}

function compare(a: unknown, b: unknown, type: SortType, collator: Intl.Collator): number {
  if (type === 'numeric') {
    return (Number.parseFloat(String(a)) || 0) - (Number.parseFloat(String(b)) || 0);
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a ?? ''), String(b ?? ''));
}

/**
 * Returns a sorted copy; the input is never mutated. Descending is the mirror of ascending,
 * and records with equal keys keep their dataset order in both directions. With no `sortBy`,
 * descending reverses the dataset.
 */
export function sortRecords<T extends object>(
  records: readonly T[],
  options: SortOptions,
  locale: Locale = DEFAULT_LOCALE,
): T[] {
  const { sortBy, sortType, sortDirection } = options;
  if (!sortBy) return sortDirection === 'desc' ? records.toReversed() : [...records];
  const collator = collatorFor(locale);
  const sign = sortDirection === 'desc' ? -1 : 1;
  const keyOf = (record: T) => (record as Record<string, unknown>)[sortBy];
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => sign * compare(keyOf(a.record), keyOf(b.record), sortType, collator) || a.index - b.index)
    .map(({ record }) => record);
}
