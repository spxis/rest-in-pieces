import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { buildBody, pageLinks, queryCollection, setPaginationHeaders } from '../lib/collection.ts';
import { requestedFormat, respond } from '../lib/format.ts';
import { parseLocale } from '../lib/locale.ts';
import { intParam, pick } from '../lib/query.ts';
import { DEFAULT_SEED, MAX_SEED, type Resource } from '../resources.ts';
import { ErrorBody, FILTER_DOCS, ListQuery, listOf, TEXT_FORMATS } from '../schemas.ts';

/** Builds the list and item routes for a resource. `deprecated` marks a legacy alias in the docs. */
export function collectionRoutes(resource: Resource, { deprecated = false, path = resource.name } = {}) {
  const id = path.replaceAll('-', '_');
  const tag = resource.name === 'countries' ? 'Reference data' : 'Datasets';
  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: [tag],
    operationId: `list_${id}`,
    summary: `List ${resource.name}`,
    description: `${resource.description}\n\n${FILTER_DOCS}`,
    deprecated,
    request: { query: ListQuery },
    responses: {
      200: {
        description: `A page of ${resource.name}. \`X-Total-Count\` and \`Link\` headers describe the whole result.`,
        content: { 'application/json': { schema: listOf(resource.schema, resource.title) }, ...TEXT_FORMATS },
      },
      400: {
        description: 'Unsupported format or locale, or a cursor that is invalid or belongs to another query.',
        content: { 'application/json': { schema: ErrorBody } },
      },
    },
  });

  const itemRoute = createRoute({
    method: 'get',
    path: '/{id}',
    tags: [tag],
    operationId: `get_${id}_item`,
    summary: `Get one ${resource.title.toLowerCase()}`,
    deprecated,
    request: {
      params: z.object({ id: z.string().openapi({ description: resource.idDescription }) }),
      query: z.object({ seed: ListQuery.shape.seed, locale: ListQuery.shape.locale, format: ListQuery.shape.format }),
    },
    responses: {
      200: {
        description: `The ${resource.title.toLowerCase()}.`,
        content: { 'application/json': { schema: resource.schema }, ...TEXT_FORMATS },
      },
      400: { description: 'Unsupported format or locale.', content: { 'application/json': { schema: ErrorBody } } },
      404: { description: 'No record has that id.', content: { 'application/json': { schema: ErrorBody } } },
    },
  });

  const seedOf = (query: Record<string, string | undefined>) =>
    resource.seeded ? intParam(pick(query, 'seed'), DEFAULT_SEED, MAX_SEED) : null;

  return new OpenAPIHono()
    .openapi(listRoute, (c) => {
      requestedFormat(c);
      const query = c.req.query();
      const seed = seedOf(query);
      const locale = parseLocale(pick(query, 'locale'));
      const { records, generatedAt } = resource.load(seed ?? DEFAULT_SEED, locale);
      c.header('Content-Language', locale);
      const page = queryCollection(records, query, resource.defaults, locale);
      const links = pageLinks(c, page);
      setPaginationHeaders(c, links, page.total);
      return respond(c, buildBody(page, links, { generatedAt, seed, locale }), page.records) as never;
    })
    .openapi(itemRoute, (c) => {
      requestedFormat(c);
      const query = c.req.query();
      const locale = parseLocale(pick(query, 'locale'));
      const { records } = resource.load(seedOf(query) ?? DEFAULT_SEED, locale);
      c.header('Content-Language', locale);
      const { id } = c.req.valid('param');
      const record = resource.find(records, id);
      if (!record) return c.json({ error: `No ${resource.title.toLowerCase()} with id "${id}".` }, 404);
      return respond(c, record, [record]) as never;
    });
}
