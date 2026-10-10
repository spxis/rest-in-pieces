import { type Query, RESERVED_PARAMS } from './query.ts';

type Operator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

export interface Filter {
  field: string;
  operator: Operator;
  values: string[];
}

const OPERATORS = new Set<Operator>(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']);
const FILTER_KEY = /^([\w-]+)(?:\[(\w+)\])?$/;

/**
 * Turns query parameters that name a record field into filters:
 *   gender=female            equality (case-insensitive)
 *   province=Ontario,Quebec  any of several values
 *   age[gte]=30&age[lt]=40   ranges: eq, ne, gt, gte, lt, lte
 *   borders=FR               a list field matches when any entry does
 * Unknown fields and reserved parameters are ignored.
 */
export function parseFilters(query: Query, fields: ReadonlySet<string>): Filter[] {
  const filters: Filter[] = [];
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined || raw === '' || RESERVED_PARAMS.has(key)) continue;
    const match = FILTER_KEY.exec(key);
    const field = match?.[1];
    const operator = (match?.[2] ?? 'eq') as Operator;
    if (!field || !fields.has(field) || !OPERATORS.has(operator)) continue;
    filters.push({ field, operator, values: operator === 'eq' ? raw.split(',').map((v) => v.trim()) : [raw] });
  }
  return filters;
}

function compare(actual: unknown, expected: string): number {
  const a = Number(actual);
  const b = Number(expected);
  // A null compares as an empty string, not as the number 0.
  if (typeof actual !== 'string' && actual !== null && Number.isFinite(a) && Number.isFinite(b)) return a - b;
  return String(actual ?? '').localeCompare(expected, undefined, { sensitivity: 'base', numeric: true });
}

function matches(record: Record<string, unknown>, { field, operator, values }: Filter): boolean {
  const actual = record[field];
  const [first = ''] = values;
  // A list field (a country's `borders`, a grouping's `members`) matches when any entry does.
  if (Array.isArray(actual) && (operator === 'eq' || operator === 'ne')) {
    const has = (value: string) => actual.some((entry) => compare(entry, value) === 0);
    return operator === 'eq' ? values.some(has) : !has(first);
  }
  switch (operator) {
    case 'eq':
      return values.some((value) => compare(actual, value) === 0);
    case 'ne':
      return compare(actual, first) !== 0;
    case 'gt':
      return compare(actual, first) > 0;
    case 'gte':
      return compare(actual, first) >= 0;
    case 'lt':
      return compare(actual, first) < 0;
    case 'lte':
      return compare(actual, first) <= 0;
  }
}

function searchable(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Applies field filters and a free-text `q` search across every value of a record. */
export function filterRecords<T extends object>(records: readonly T[], filters: Filter[], q?: string): T[] {
  const needle = q?.trim().toLowerCase();
  if (filters.length === 0 && !needle) return [...records];
  return records.filter((record) => {
    const values = record as Record<string, unknown>;
    if (!filters.every((filter) => matches(values, filter))) return false;
    return !needle || Object.values(values).some((value) => searchable(value).toLowerCase().includes(needle));
  });
}
