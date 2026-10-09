import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { cascade, checkReferences } from '../lib/integrity.ts';
import { contentLanguage, parseLocale } from '../lib/locale.ts';
import { flagParam, intParam, pick } from '../lib/query.ts';
import { RequestData } from '../lib/relations.ts';
import { type Session, SessionFullError } from '../lib/session.ts';
import { DEFAULT_SEED, MAX_SEED, type Resource } from '../resources.ts';
import { AuthErrors, ErrorBody, ListQuery, OPTIONAL_BEARER, ValidationErrorBody } from '../schemas.ts';

type Fields = Record<string, unknown>;

/** The value at a path in a parsed body, or undefined when any step is missing. */
function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let value = data;
  for (const key of path) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<PropertyKey, unknown>)[key];
  }
  return value;
}

/**
 * One message per failing field, keyed by its dotted path. A missing field says `Required`; a body
 * that is not an object at all is reported under `body`.
 */
export function fieldErrors(issues: readonly z.core.$ZodIssue[], data: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : 'body';
    if (key in fields) continue;
    const absent = issue.path.length > 0 && valueAt(data, issue.path) === undefined;
    fields[key] = absent ? 'Required' : issue.path.length === 0 ? 'Expected a JSON object' : issue.message;
  }
  return fields;
}

const WriteQuery = z.object({
  seed: ListQuery.shape.seed,
  locale: ListQuery.shape.locale,
  conflict: z.string().optional().openapi({
    description: '`true` answers `409 Conflict`, so a client can rehearse "someone else changed this".',
  }),
  delay: ListQuery.shape.delay,
  trickle: ListQuery.shape.trickle,
  status: ListQuery.shape.status,
  fail: ListQuery.shape.fail,
  auth: ListQuery.shape.auth,
});

/** What a related dataset's writes add to the description. */
function integrityDocs(resource: Resource, all: readonly Resource[]): string {
  const parts: string[] = [];
  const refs = Object.entries(resource.references ?? {});
  if (refs.length > 0) {
    parts.push(
      `${refs.map(([key, target]) => `\`${key}\` must name a record in \`/${target}\``).join(', and ')} at the same \`seed\` and \`locale\`, or the write answers \`422\`.`,
    );
  }
  const dependents = all.filter((other) => Object.values(other.references ?? {}).includes(resource.name));
  if (dependents.length > 0) {
    parts.push(
      `With the session on, deleting a ${resource.title.toLowerCase()} also deletes the ${dependents.map((d) => d.name).join(', ')} that point at it, and theirs in turn.`,
    );
  }
  return parts.length > 0 ? `\n\n${parts.join(' ')}` : '';
}

const STATELESS =
  'By default nothing is stored, so a later read returns the same data as before and the response is what ' +
  'the write would have produced. With the session on (`--session`, `REST_IN_PIECES_SESSION=true` or ' +
  '`createApp({ session: true })`), the change is kept in memory and later reads at the same `seed` and ' +
  '`locale` see it, until `POST /reset`. A session that is full answers `507`.';

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

const jsonBody = (schema: z.ZodType, description: string) => ({ required: true, ...json(schema, description) });

/** Builds `POST /`, `PUT /{id}`, `PATCH /{id}` and `DELETE /{id}` for a resource that has an input schema. */
export function writeRoutes(
  resource: Resource & { input: z.ZodObject },
  { id, tag, session, all = [] }: { id: string; tag: string; session: Session; all?: readonly Resource[] },
) {
  const title = resource.title.toLowerCase();
  const lookup = (name: string) => all.find((r) => r.name === name);
  const integrity = integrityDocs(resource, all);
  const written =
    resource.schema instanceof z.ZodObject
      ? resource.schema
          .extend({
            createdAt: z
              .string()
              .datetime()
              .optional()
              .openapi({ description: 'Set by `POST`; kept by `PUT` and `PATCH`.' }),
            updatedAt: z.string().datetime().openapi({ description: 'When the write happened.' }),
          })
          .openapi(`Written${resource.title}`)
      : resource.schema;
  const params = z.object({ id: z.string().openapi({ description: resource.idDescription }) });
  const notFound = { 404: json(ErrorBody, 'No record has that id.') };
  const conflicted = { 409: json(ErrorBody, 'Answered when `conflict=true`.') };
  const invalid = { 422: json(ValidationErrorBody, 'The body did not validate. `fields` says which fields and why.') };
  const full = {
    507: json(ErrorBody, 'With the session on: it has no room for this write. `POST /reset` empties it.'),
  };

  const postRoute = createRoute({
    method: 'post',
    path: '/',
    tags: [tag],
    operationId: `create_${id}_item`,
    summary: `Create a ${title}`,
    description: `Validates the body and answers with the new ${title}: the next id after the dataset's last, \`createdAt\`, \`updatedAt\` and a \`Location\` header. Fields the server sets are ignored if sent.${integrity}\n\n${STATELESS}`,
    security: OPTIONAL_BEARER,
    request: { query: WriteQuery, body: jsonBody(resource.input, `The ${title}, without the fields the server sets.`) },
    responses: {
      201: json(written, `The ${title} as it was created.`),
      ...conflicted,
      ...invalid,
      ...AuthErrors,
      ...full,
    },
  });

  const putRoute = createRoute({
    method: 'put',
    path: '/{id}',
    tags: [tag],
    operationId: `replace_${id}_item`,
    summary: `Replace a ${title}`,
    description: `Validates the whole ${title} and answers with it under the same id, with \`updatedAt\` set.${integrity}\n\n${STATELESS}`,
    security: OPTIONAL_BEARER,
    request: { params, query: WriteQuery, body: jsonBody(resource.input, `Every field of the ${title}.`) },
    responses: {
      200: json(written, `The ${title} as it was saved.`),
      ...notFound,
      ...conflicted,
      ...invalid,
      ...AuthErrors,
      ...full,
    },
  });

  const patchRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: [tag],
    operationId: `update_${id}_item`,
    summary: `Update a ${title}`,
    description: `Validates the fields sent and answers with the ${title} merged with them, with \`updatedAt\` set.${integrity}\n\n${STATELESS}`,
    security: OPTIONAL_BEARER,
    request: { params, query: WriteQuery, body: jsonBody(resource.input.partial(), 'Only the fields to change.') },
    responses: {
      200: json(written, `The ${title} as it was saved.`),
      ...notFound,
      ...conflicted,
      ...invalid,
      ...AuthErrors,
      ...full,
    },
  });

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    tags: [tag],
    operationId: `delete_${id}_item`,
    summary: `Delete a ${title}`,
    description: `Answers \`204 No Content\` for a ${title} that exists.${integrity}\n\n${STATELESS}`,
    security: OPTIONAL_BEARER,
    request: { params, query: WriteQuery },
    responses: {
      204: { description: `The ${title} was deleted.` },
      ...notFound,
      ...conflicted,
      ...AuthErrors,
      ...full,
    },
  });

  /** Where a write lands: the dataset a read with the same `seed` and `locale` sees. */
  const target = (c: Context) => {
    const query = c.req.query();
    const seed = resource.seeded ? intParam(pick(query, 'seed'), DEFAULT_SEED, MAX_SEED) : DEFAULT_SEED;
    const locale = parseLocale(pick(query, 'locale'));
    contentLanguage(c, locale);
    return { seed, locale };
  };
  const dataset = (c: Context) => {
    const { seed, locale } = target(c);
    return session.load(resource, seed, locale).records as Fields[];
  };
  /** Keeps a write when the session is on; a session with no room answers 507 and keeps nothing. */
  const keep = (c: Context, write: (seed: number, locale: ReturnType<typeof parseLocale>) => void) => {
    const { seed, locale } = target(c);
    try {
      write(seed, locale);
      return null;
    } catch (error) {
      if (error instanceof SessionFullError) return c.json({ error: error.message }, 507);
      throw error;
    }
  };
  const find = (c: Context, recordId: string) => resource.find(dataset(c), recordId) as Fields | undefined;
  /** The validated body. The input schema is only known at run time, so its type is a plain record. */
  const sent = (c: Context) => (c.req.valid as (target: 'json') => Fields)('json');
  const notFoundFor = (c: Context, recordId: string) => c.json({ error: `No ${title} with id "${recordId}".` }, 404);
  const conflicting = (c: Context) => flagParam(pick(c.req.query(), 'conflict'), false);
  const changedElsewhere = `This ${title} was changed by someone else. Reload it and try again.`;
  const now = () => new Date().toISOString();
  const dataFor = (c: Context) => {
    const { seed, locale } = target(c);
    return new RequestData(lookup, session, seed, locale, null, 0);
  };
  /**
   * The fields a write keeps: the references checked, and anything the server works out (an order's totals)
   * filled in. `null` stands for a body that names records that do not exist, answered with a 422.
   */
  const prepare = (c: Context, body: Fields, existing?: Fields): { record: Fields } | Response => {
    if (!resource.references && !resource.derive) return { record: body };
    const data = dataFor(c);
    const errors = checkReferences(resource, body, data);
    if (Object.keys(errors).length > 0) return c.json({ error: 'Validation failed', fields: errors }, 422);
    if (!resource.derive) return { record: body };
    const derived = resource.derive(body, existing, data);
    if ('errors' in derived) return c.json({ error: 'Validation failed', fields: derived.errors }, 422);
    return derived;
  };

  return new OpenAPIHono({
    // Only the body can fail: every query parameter and the id are free-form strings.
    defaultHook: (result, c) => {
      if (result.success || result.target !== 'json') return;
      const fields = fieldErrors(result.error.issues, (result as { data?: unknown }).data);
      return c.json({ error: 'Validation failed', fields }, 422);
    },
  })
    .openapi(postRoute, (c) => {
      if (conflicting(c)) return c.json({ error: `A ${title} like this already exists.` }, 409);
      const { seed, locale } = target(c);
      const prepared = prepare(c, sent(c));
      if (prepared instanceof Response) return prepared as never;
      const next = session.nextId(resource, seed, locale);
      const at = now();
      const record = { [resource.idField]: next, ...prepared.record, createdAt: at, updatedAt: at };
      const refused = keep(c, (s, l) => session.create(resource, s, l, record));
      if (refused) return refused as never;
      c.header('Location', `${c.req.path.replace(/\/+$/, '')}/${next}`);
      return c.json(record, 201) as never;
    })
    .openapi(putRoute, (c) => {
      const { id: recordId } = c.req.valid('param');
      const record = find(c, recordId);
      if (!record) return notFoundFor(c, recordId);
      if (conflicting(c)) return c.json({ error: changedElsewhere }, 409);
      const prepared = prepare(c, sent(c), record);
      if (prepared instanceof Response) return prepared as never;
      const kept = 'createdAt' in record ? { createdAt: record.createdAt } : {};
      const saved = { [resource.idField]: record[resource.idField], ...prepared.record, ...kept, updatedAt: now() };
      const refused = keep(c, (s, l) => session.replace(resource, s, l, saved));
      return (refused ?? c.json(saved)) as never;
    })
    .openapi(patchRoute, (c) => {
      const { id: recordId } = c.req.valid('param');
      const record = find(c, recordId);
      if (!record) return notFoundFor(c, recordId);
      if (conflicting(c)) return c.json({ error: changedElsewhere }, 409);
      const prepared = prepare(c, sent(c), record);
      if (prepared instanceof Response) return prepared as never;
      const saved = { ...record, ...prepared.record, updatedAt: now() };
      const refused = keep(c, (s, l) => session.replace(resource, s, l, saved));
      return (refused ?? c.json(saved)) as never;
    })
    .openapi(deleteRoute, (c) => {
      const { id: recordId } = c.req.valid('param');
      const record = find(c, recordId);
      if (!record) return notFoundFor(c, recordId);
      if (conflicting(c)) return c.json({ error: changedElsewhere }, 409);
      const refused = keep(c, (s, l) => {
        if (!session.enabled) return;
        // Everything that points at the record goes with it, or nothing does: room is made for every dataset first.
        const plan = cascade(resource, record[resource.idField], dataFor(c), all);
        session.reserve([...plan.keys()], s, l);
        for (const [dataset, ids] of plan) {
          if (dataset === resource) session.remove(resource, s, l, record[resource.idField]);
          else session.removeMany(dataset, s, l, ids);
        }
      });
      return (refused ?? c.body(null, 204)) as never;
    });
}
