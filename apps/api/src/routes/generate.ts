import { Hono } from 'hono';
import { generateRecords, hasGenerator } from '../data/generators.ts';
import { DEFAULT_SEED, MAX_RECORDS } from '../data/names.ts';
import { intParam, paginate, pick } from '../lib/query.ts';
import { parseSort, sortRecords } from '../lib/sort.ts';

const DEFAULT_LIMIT = 10;

function parseFields(value: string | undefined): Array<{ name: string; type: string }> | null {
  if (!value) return null;
  const fields = value.split(',').map((part) => {
    const [name, type, ...extra] = part.trim().split(':');
    return name && type && extra.length === 0 && /^[\w-]+$/.test(name) ? { name, type } : null;
  });
  if (fields.length === 0 || fields.length > 50 || fields.some((field) => field === null)) return null;
  return fields as Array<{ name: string; type: string }>;
}

export const generate = new Hono().get('/', (c) => {
  const query = c.req.query();
  const fields = parseFields(pick(query, 'fields'));
  if (!fields) return c.json({ error: 'Provide 1 to 50 fields as name:generatorType pairs.' }, 400);

  const unknownType = fields.find(({ type }) => !hasGenerator(type))?.type;
  if (unknownType) return c.json({ error: `Unknown generator type: ${unknownType}` }, 400);

  const limit = intParam(pick(query, 'limit', 'size', 'length'), DEFAULT_LIMIT, MAX_RECORDS);
  const offset = intParam(pick(query, 'offset'), 0, MAX_RECORDS);
  const max = intParam(pick(query, 'max', 'maxRecords'), MAX_RECORDS, MAX_RECORDS);
  const seed = intParam(pick(query, 'seed'), DEFAULT_SEED, 2 ** 32 - 1);
  const sort = parseSort(
    pick(query, 'sortBy', 'sortby', 'sortField', 'sortfield'),
    pick(query, 'sortDirection', 'sortdirection', 'sortOrder', 'sortorder'),
  );
  const records = sortRecords(generateRecords(fields, max, seed), sort);
  return c.json(paginate(records, offset, limit));
});
