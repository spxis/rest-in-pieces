import { Hono } from 'hono';
import pkg from '../../package.json' with { type: 'json' };
import { DEFAULT_SEED, getPeople, MAX_RECORDS } from '../data/names.ts';
import { flagParam, intParam, paginate, pick } from '../lib/query.ts';
import { parseSort, sortRecords } from '../lib/sort.ts';

const DEFAULT_LIMIT = 10;
const DEFAULT_RESULTS_NAME = 'results';

export const names = new Hono().get('/', (c) => {
  const query = c.req.query();

  const limit = intParam(pick(query, 'limit', 'size', 'length'), DEFAULT_LIMIT, MAX_RECORDS);
  const offset = intParam(pick(query, 'offset'), 0, MAX_RECORDS);
  const max = intParam(pick(query, 'max', 'maxRecords'), MAX_RECORDS, MAX_RECORDS);
  const seed = intParam(pick(query, 'seed'), DEFAULT_SEED, 2 ** 32 - 1);
  const sort = parseSort(
    pick(query, 'sortBy', 'sortby', 'sortField', 'sortfield'),
    pick(query, 'sortDirection', 'sortdirection', 'sortOrder', 'sortorder'),
  );
  const requestedName = pick(query, 'resultsName');
  const resultsName = requestedName && requestedName !== 'metadata' ? requestedName : DEFAULT_RESULTS_NAME;
  const showMetadata = flagParam(pick(query, 'metadata'));

  const { people, generatedAt } = getPeople(seed);
  // `max` shrinks the dataset itself, so clients can exercise their end-of-data handling.
  const dataset = sortRecords(people, sort).slice(0, max);
  const results = paginate(dataset, offset, limit);

  if (!showMetadata) return c.json(results);

  return c.json({
    metadata: {
      count: results.length,
      total: dataset.length,
      timestamp: String(generatedAt.getTime()),
      lastUpdated: generatedAt.toISOString(),
      output: { results: resultsName },
      version: pkg.version,
      parameters: { size: limit, offset, max, seed, ...sort },
    },
    [resultsName]: results,
  });
});
