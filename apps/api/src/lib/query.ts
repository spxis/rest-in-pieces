import { z } from 'zod';

export type Query = Record<string, string | undefined>;

/** Returns the value of the first alias present in the query string. */
export function pick(query: Query, ...aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = query[alias];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

const nonNegativeInt = z.coerce.number().int().nonnegative();

/** Parses a non-negative integer, clamped to `max`. Falls back when missing or invalid. */
export function intParam(value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined) return fallback;
  const parsed = nonNegativeInt.safeParse(value);
  return parsed.success ? Math.min(parsed.data, max) : fallback;
}

/** `0`, `false`, `no` and `off` are false; any other value is true. */
export function flagParam(value: string | undefined, fallback = true): boolean {
  if (value === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

export function paginate<T>(items: readonly T[], offset: number, limit: number): T[] {
  return items.slice(offset, offset + limit);
}

/** Query parameters with a fixed meaning. They are never treated as field filters. */
export const RESERVED_PARAMS = new Set([
  'limit',
  'size',
  'length',
  'offset',
  'max',
  'maxRecords',
  'sortBy',
  'sortby',
  'sortField',
  'sortfield',
  'sortDirection',
  'sortdirection',
  'sortOrder',
  'sortorder',
  'metadata',
  'resultsName',
  'seed',
  'format',
  'delay',
  'status',
  'fail',
  'fields',
  'q',
  'locale',
]);
