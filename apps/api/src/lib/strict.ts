import { FILTER_KEY, OPERATORS } from './filter.ts';
import { isCount, pick, type Query, RESERVED_PARAMS } from './query.ts';
import { DESCENDING, NUMERIC } from './sort.ts';

/** What `strict=true` answers `400` for: a query the lenient default would have quietly ignored or clamped. */
export class StrictError extends Error {}

const ASCENDING = new Set(['asc', 'ascending']);
const COUNTS = ['limit', 'size', 'length', 'pageSize', 'offset', 'page', 'max', 'maxRecords'] as const;
const SORT_FIELDS = ['sortBy', 'sortby', 'sortField', 'sortfield'] as const;
const SORT_DIRECTIONS = ['sortDirection', 'sortdirection', 'sortOrder', 'sortorder'] as const;

const quoted = (names: Iterable<string>) => [...names].map((name) => `"${name}"`).join(', ');

/**
 * The message for a `fail` that is not `true`, `false` or a share from 0 to 1 (`15` is not 15%), or null. `fail` is read before a
 * route runs, so the simulation asks this itself when the request is strict.
 */
export function failProblem(value: string | undefined): string | null {
  if (value === undefined || value === '' || ['true', 'false'].includes(value.toLowerCase())) return null;
  const share = Number(value);
  return share >= 0 && share <= 1
    ? null
    : `strict=true refuses this query: fail is true, false or a share from 0 to 1 (0.2 fails one request in five), not "${value}".`;
}

/**
 * With `strict=true`, the things the default reads leniently are refused, each named, so a misspelled filter cannot pass a test
 * against the wrong data: a parameter that is neither one of the API's nor a field of the dataset (`foo=bar`, `sort=email.asc`),
 * an operator that does not exist (`id[bogus]`), a sort on a field the dataset lacks or with a type that is not one, a sort
 * direction that is not one, a count that is not a whole number, and `messy` outside 0 to 1 (a share, not a percent; `fail` is checked where it is read, by `failProblem`).
 * `fields` is every key the dataset's records have.
 *
 * @throws StrictError naming everything wrong at once.
 */
export function checkStrict(query: Query, fields: ReadonlySet<string>): void {
  const problems: string[] = [];
  const unknown: string[] = [];
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined || raw === '' || RESERVED_PARAMS.has(key)) continue;
    const match = FILTER_KEY.exec(key);
    const field = match?.[1];
    const operator = match?.[2] ?? 'eq';
    if (!field || !fields.has(field)) unknown.push(key);
    else if (!OPERATORS.has(operator)) {
      problems.push(`"${key}" uses the operator "${operator}"; use one of ${quoted(OPERATORS)}`);
    }
  }
  if (unknown.length > 0) {
    const hint = unknown.some((key) => /^sort/i.test(key)) ? ' (to sort, use sortBy and sortDirection)' : '';
    problems.push(`${quoted(unknown)} ${unknown.length === 1 ? 'is' : 'are'} not a parameter or a field${hint}`);
  }

  const sortBy = pick(query, ...SORT_FIELDS);
  if (sortBy !== undefined) {
    const match = /^\s*([\w-]*)\s*(?::([\w-]*))?\s*$/.exec(sortBy);
    const field = match?.[1] ?? sortBy;
    const type = match?.[2]?.toLowerCase();
    if (!fields.has(field)) problems.push(`sortBy "${field}" is not a field`);
    if (type !== undefined && type !== 'string' && !NUMERIC.has(type)) {
      problems.push(`sortBy type "${type}" is not one; use "string" or "numeric"`);
    }
  }
  const direction = pick(query, ...SORT_DIRECTIONS)?.toLowerCase();
  if (direction !== undefined && !ASCENDING.has(direction) && !DESCENDING.has(direction)) {
    problems.push(`sortDirection "${direction}" is not one; use "asc" or "desc"`);
  }

  for (const name of COUNTS) {
    const value = query[name];
    if (value !== undefined && value !== '' && !isCount(value))
      problems.push(`${name} must be a whole number, not "${value}"`);
  }
  const messy = pick(query, 'messy');
  if (
    messy !== undefined &&
    !['true', 'false'].includes(messy.toLowerCase()) &&
    !(Number(messy) >= 0 && Number(messy) <= 1)
  ) {
    problems.push(`messy is a share from 0 to 1 (0.2 is one value in five), not "${messy}"`);
  }
  if (problems.length > 0) {
    throw new StrictError(`strict=true refuses this query: ${problems.join('; ')}. Fields: ${[...fields].join(', ')}.`);
  }
}
