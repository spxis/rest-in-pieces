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

function compare(a: unknown, b: unknown, type: SortType): number {
  if (type === 'numeric') {
    return (Number.parseFloat(String(a)) || 0) - (Number.parseFloat(String(b)) || 0);
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

/** Returns a sorted copy; the input is never mutated. */
export function sortRecords<T extends object>(records: readonly T[], options: SortOptions): T[] {
  const { sortBy, sortType, sortDirection } = options;
  const sorted = sortBy
    ? records.toSorted((a, b) =>
        compare((a as Record<string, unknown>)[sortBy], (b as Record<string, unknown>)[sortBy], sortType),
      )
    : [...records];
  return sortDirection === 'desc' ? sorted.reverse() : sorted;
}
