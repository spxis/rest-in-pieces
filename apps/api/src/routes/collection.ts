import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { buildBody, pageLinks, queryCollection, setPaginationHeaders } from '../lib/collection.ts';
import { requestedFormat, respond } from '../lib/format.ts';
import { contentLanguage, parseLocale } from '../lib/locale.ts';
import { parseMessy } from '../lib/messy.ts';
import { intParam, pick } from '../lib/query.ts';
import {
  expandable,
  expandRecords,
  MAX_EMBEDDED,
  MAX_EXPAND_DEPTH,
  parseExpand,
  RequestData,
} from '../lib/relations.ts';
import { publicBase, safeRecords, wantsSafe } from '../lib/safe.ts';
import { createSession, type Session } from '../lib/session.ts';
import { DEFAULT_SEED, MAX_SEED, type Resource } from '../resources.ts';
import {
  AuthErrors,
  ErrorBody,
  FILTER_DOCS,
  ListQuery,
  listOf,
  OPTIONAL_BEARER,
  SAFE_DOCS,
  TABLE_DOCS,
  TEXT_FORMATS,
} from '../schemas.ts';
import { writeRoutes } from './writes.ts';

export interface CollectionRouteOptions {
  /** Marks a legacy alias in the docs. An alias takes no writes. */
  deprecated?: boolean;
  path?: string;
  /** Where reads find the records and writes keep them. Without one, nothing is kept. */
  session?: Session;
  /** Every dataset, for relations, `expand` and the checks writes make. */
  all?: readonly Resource[];
  /** Safe values unless a request says `safe=false`. Off by default in 2.x. */
  safe?: boolean;
}

/** The `expand` description for one dataset, listing what it can expand. */
function expandDocs(resource: Resource, all: readonly Resource[]): string | undefined {
  const names = expandable(resource, (name) => all.find((r) => r.name === name));
  if (names.length === 0) return undefined;
  return `Embeds related records, comma-separated: ${names.map((n) => `\`${n}\``).join(', ')}. Paths go ${MAX_EXPAND_DEPTH} levels deep at most, apply to the page only, and embed at most ${MAX_EMBEDDED} records in all; a related record that no longer exists is \`null\`.`;
}

/**
 * Builds the list and item routes for a resource, the nested list of each relation it owns
 * (`/users/{id}/orders`), and the write routes when it has an input schema.
 * `deprecated` marks a legacy alias in the docs; an alias takes no writes.
 */
export function collectionRoutes(
  resource: Resource,
  {
    deprecated = false,
    path = resource.name,
    session = createSession(false),
    all = [resource],
    safe: safeByDefault = false,
  }: CollectionRouteOptions = {},
) {
  const id = path.replaceAll('-', '_');
  const tag = resource.name === 'countries' ? 'Reference data' : 'Datasets';
  const lookup = (name: string) => all.find((r) => r.name === name);
  const extraQuery = (target: Resource) => {
    const expand = expandDocs(target, all);
    return {
      safe: z.string().optional().openapi({ description: SAFE_DOCS }),
      table: z.string().optional().openapi({ description: TABLE_DOCS }),
      ...(expand ? { expand: z.string().optional().openapi({ description: expand }) } : {}),
    };
  };

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: [tag],
    operationId: `list_${id}`,
    summary: `List ${resource.name}`,
    description: `${resource.description}\n\n${FILTER_DOCS}`,
    deprecated,
    security: OPTIONAL_BEARER,
    request: { query: ListQuery.extend(extraQuery(resource)) },
    responses: {
      200: {
        description: `A page of ${resource.name}. \`X-Total-Count\` and \`Link\` headers describe the whole result.`,
        content: { 'application/json': { schema: listOf(resource.schema, resource.title) }, ...TEXT_FORMATS },
      },
      400: {
        description:
          'Unsupported format, locale or table name, an `expand` that is not a relation, or a cursor that is invalid or belongs to another query.',
        content: { 'application/json': { schema: ErrorBody } },
      },
      ...AuthErrors,
    },
  });

  const itemRoute = createRoute({
    method: 'get',
    path: '/{id}',
    tags: [tag],
    operationId: `get_${id}_item`,
    summary: `Get one ${resource.title.toLowerCase()}`,
    deprecated,
    security: OPTIONAL_BEARER,
    request: {
      params: z.object({ id: z.string().openapi({ description: resource.idDescription }) }),
      query: z.object({
        seed: ListQuery.shape.seed,
        locale: ListQuery.shape.locale,
        format: ListQuery.shape.format,
        messy: ListQuery.shape.messy,
        auth: ListQuery.shape.auth,
        ...extraQuery(resource),
      }),
    },
    responses: {
      200: {
        description: `The ${resource.title.toLowerCase()}.`,
        content: { 'application/json': { schema: resource.schema }, ...TEXT_FORMATS },
      },
      400: {
        description: 'Unsupported format, locale or table name, or an `expand` that is not a relation.',
        content: { 'application/json': { schema: ErrorBody } },
      },
      404: { description: 'No record has that id.', content: { 'application/json': { schema: ErrorBody } } },
      ...AuthErrors,
    },
  });

  /** One request's view of every dataset, with its seed, locale, session, safe values and mess. */
  const dataFor = (c: Context) => {
    const query = c.req.query();
    const seed = resource.seeded ? intParam(pick(query, 'seed'), DEFAULT_SEED, MAX_SEED) : DEFAULT_SEED;
    const locale = parseLocale(pick(query, 'locale'));
    const safe = wantsSafe(query, safeByDefault)
      ? { base: publicBase(c.req.url, c.req.header('x-forwarded-prefix')) }
      : null;
    return new RequestData(lookup, session, seed, locale, safe, parseMessy(pick(query, 'messy')));
  };

  /** Lists `records` (with each one's position in its whole dataset) through the shared pipeline, then expands the page. */
  const list = (c: Context, target: Resource, data: RequestData, records: object[], positions?: number[]) => {
    requestedFormat(c);
    const tree = parseExpand(c.req.query(), target, lookup);
    contentLanguage(c, data.locale);
    const shown = data.safe ? safeRecords(target.name, records, data.safe) : records;
    const page = queryCollection(shown, c.req.query(), target.defaults, data.locale, {
      seed: data.seed,
      keep: target.keep ?? [target.idField],
      ...(positions ? { positions } : {}),
    });
    const expanded = tree ? { ...page, records: expandRecords(page.records as never, target, tree, data) } : page;
    const links = pageLinks(c, expanded);
    setPaginationHeaders(c, links, expanded.total);
    const { generatedAt } = session.load(target, data.seed, data.locale);
    const meta = { generatedAt, seed: target.seeded ? data.seed : null, locale: data.locale };
    return respond(c, buildBody(expanded, links, meta), expanded.records, target.name);
  };

  let routes = new OpenAPIHono()
    .openapi(listRoute, (c) => {
      const data = dataFor(c);
      return list(c, resource, data, data.records(resource)) as never;
    })
    .openapi(itemRoute, (c) => {
      requestedFormat(c);
      const data = dataFor(c);
      const tree = parseExpand(c.req.query(), resource, lookup);
      contentLanguage(c, data.locale);
      const { id: recordId } = c.req.valid('param');
      const records = data.records(resource);
      const found = resource.find(records, recordId);
      if (!found) return c.json({ error: `No ${resource.title.toLowerCase()} with id "${recordId}".` }, 404);
      // The same rewrites the list applies, so a record reads the same in its list and on its own.
      const record = data.present(resource, records.indexOf(found as never));
      const shown = tree ? (expandRecords([record], resource, tree, data)[0] as object) : record;
      return respond(c, shown, [shown], resource.name) as never;
    });

  // `/users/{id}/orders` and the like: the parent's children, through the same pipeline as any list.
  for (const [name, relation] of Object.entries(resource.relations ?? {})) {
    const child = relation.kind === 'many' ? lookup(relation.target) : undefined;
    if (deprecated || relation.kind !== 'many' || !child) continue;
    const nestedRoute = createRoute({
      method: 'get',
      path: `/{id}/${name}`,
      tags: [tag],
      operationId: `list_${id}_${name}`,
      summary: `List one ${resource.title.toLowerCase()}'s ${name}`,
      description: `The ${name} whose \`${relation.key}\` is this ${resource.title.toLowerCase()}'s id, in id order: the same records \`/${child.name}?${relation.key}={id}\` returns, found without a scan. Paging, sorting, filters, search, formats, \`expand\`, \`messy\`, \`safe\` and the simulation all work as they do on \`/${child.name}\`.\n\n${FILTER_DOCS}`,
      security: OPTIONAL_BEARER,
      request: {
        params: z.object({ id: z.string().openapi({ description: resource.idDescription }) }),
        query: ListQuery.extend(extraQuery(child)),
      },
      responses: {
        200: {
          description: `A page of the ${resource.title.toLowerCase()}'s ${name}.`,
          content: { 'application/json': { schema: listOf(child.schema, child.title) }, ...TEXT_FORMATS },
        },
        400: {
          description: 'Unsupported format, locale or table name, or an `expand` that is not a relation.',
          content: { 'application/json': { schema: ErrorBody } },
        },
        404: {
          description: `No ${resource.title.toLowerCase()} has that id.`,
          content: { 'application/json': { schema: ErrorBody } },
        },
        ...AuthErrors,
      },
    });
    routes = routes.openapi(nestedRoute, (c) => {
      const data = dataFor(c);
      const { id: parentId } = c.req.valid('param');
      if (data.indexOf(resource, parentId) < 0) {
        return c.json({ error: `No ${resource.title.toLowerCase()} with id "${parentId}".` }, 404) as never;
      }
      const positions = data.childPositions(child, relation.key, parentId);
      const records = data.records(child);
      return list(
        c,
        child,
        data,
        positions.map((at) => records[at] as object),
        positions,
      ) as never;
    }) as never;
  }

  const { input } = resource;
  return deprecated || !input
    ? routes
    : routes.route('/', writeRoutes({ ...resource, input }, { id, tag, session, all }));
}
