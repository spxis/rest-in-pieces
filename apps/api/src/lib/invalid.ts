import type { Context } from 'hono';
import { SchemaError } from '../data/generators.ts';
import { type Query, RESERVED_PARAMS } from './query.ts';

/** A failed validation, as the OpenAPI router hands it to a `defaultHook`. */
interface Failed {
  success: boolean;
  target?: string;
  data?: unknown;
  error?: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
}

/**
 * The `defaultHook` of every router whose query parameters are validated: a failure answers `400` with the same
 * `{ "error": "..." }` body as every other refusal, never the validator's own dump. A parameter that takes one
 * value and was repeated (`?limit=1&limit=2`) says so.
 */
export function invalidRequest(result: Failed, c: Context): Response | undefined {
  if (result.success) return undefined;
  const issue = result.error?.issues[0];
  const key = issue?.path[0];
  const sent =
    typeof key === 'string' && result.data !== null && typeof result.data === 'object'
      ? (result.data as Record<string, unknown>)[key]
      : undefined;
  const where = issue?.path.length ? ` at "${issue.path.map(String).join('.')}"` : '';
  const why = Array.isArray(sent) ? `give it once, not ${sent.length} times` : (issue?.message ?? 'unknown problem');
  return c.json({ error: `Invalid request${where}: ${why}` }, 400);
}

/**
 * The query of a request with repeated parameters read as the docs describe a filter taking a list: `city=a&city=b`
 * is `city=a,b`. A parameter with a fixed meaning, and a range (`age[gte]`), takes one value, so repeating either
 * is refused (`400`) rather than answered from the first.
 */
export function queryWithRepeats(queries: Record<string, string[]>): Query {
  const query: Query = {};
  for (const [key, values] of Object.entries(queries)) {
    const [first] = values;
    if (values.length <= 1) query[key] = first;
    else if (RESERVED_PARAMS.has(key) || key.includes('[')) {
      throw new SchemaError(`Invalid request at "${key}": give it once, not ${values.length} times`);
    } else query[key] = values.join(',');
  }
  return query;
}
