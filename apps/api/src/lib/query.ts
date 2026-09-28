import { z } from 'zod';

type Query = Record<string, string | undefined>;

/** Returns the value of the first alias present in the query string. */
export function pick(query: Query, ...aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const value = query[alias];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

/** Parses a non-negative integer, clamped to `max`. Falls back when missing or invalid. */
export function intParam(value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = z.coerce.number().int().nonnegative().safeParse(value);
  if (value === undefined || !parsed.success) return fallback;
  return Math.min(parsed.data, max);
}

/** `metadata=0` and `metadata=false` turn the envelope off; anything else leaves it on. */
export function flagParam(value: string | undefined, fallback = true): boolean {
  if (value === undefined) return fallback;
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

export function paginate<T>(items: readonly T[], offset: number, limit: number): T[] {
  return items.slice(offset, offset + limit);
}
