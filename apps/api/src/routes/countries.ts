import { countries as countryData } from 'country-data';
import { Hono } from 'hono';
import { intParam, paginate, pick } from '../lib/query.ts';

const all = countryData.all;

export const countries = new Hono().get('/', (c) => {
  const query = c.req.query();
  const offset = intParam(pick(query, 'offset'), 0, all.length);
  const limit = intParam(pick(query, 'limit', 'size', 'length'), all.length, all.length);
  return c.json(paginate(all, offset, limit));
});
