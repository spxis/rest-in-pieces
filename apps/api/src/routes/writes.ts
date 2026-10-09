import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { contentLanguage, parseLocale } from '../lib/locale.ts';
import { flagParam, intParam, pick } from '../lib/query.ts';
import { DEFAULT_SEED, MAX_SEED, type Resource } from '../resources.ts';
import { ErrorBody, ListQuery, ValidationErrorBody } from '../schemas.ts';

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
});

const STATELESS =
  'Stateless by design: nothing is stored, so a later read returns the same data as before. ' +
  'The response is what the write would have produced.';

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

const jsonBody = (schema: z.ZodType, description: string) => ({ required: true, ...json(schema, description) });

/** Builds `POST /`, `PUT /{id}`, `PATCH /{id}` and `DELETE /{id}` for a resource that has an input schema. */
export function writeRoutes(resource: Resource & { input: z.ZodObject }, { id, tag }: { id: string; tag: string }) {
  const title = resource.title.toLowerCase();
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

  const postRoute = createRoute({
    method: 'post',
    path: '/',
    tags: [tag],
    operationId: `create_${id}_item`,
    summary: `Create a ${title}`,
    description: `Validates the body and answers with the new ${title}: the next id after the dataset's last, \`createdAt\`, \`updatedAt\` and a \`Location\` header. Fields the server sets are ignored if sent.\n\n${STATELESS}`,
    request: { query: WriteQuery, body: jsonBody(resource.input, `The ${title}, without the fields the server sets.`) },
    responses: { 201: json(written, `The ${title} as it would have been created.`), ...conflicted, ...invalid },
  });

  const putRoute = createRoute({
    method: 'put',
    path: '/{id}',
    tags: [tag],
    operationId: `replace_${id}_item`,
    summary: `Replace a ${title}`,
    description: `Validates the whole ${title} and answers with it under the same id, with \`updatedAt\` set.\n\n${STATELESS}`,
    request: { params, query: WriteQuery, body: jsonBody(resource.input, `Every field of the ${title}.`) },
    responses: {
      200: json(written, `The ${title} as it would have been saved.`),
      ...notFound,
      ...conflicted,
      ...invalid,
    },
  });

  const patchRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: [tag],
    operationId: `update_${id}_item`,
    summary: `Update a ${title}`,
    description: `Validates the fields sent and answers with the ${title} merged with them, with \`updatedAt\` set.\n\n${STATELESS}`,
    request: { params, query: WriteQuery, body: jsonBody(resource.input.partial(), 'Only the fields to change.') },
    responses: {
      200: json(written, `The ${title} as it would have been saved.`),
      ...notFound,
      ...conflicted,
      ...invalid,
    },
  });

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    tags: [tag],
    operationId: `delete_${id}_item`,
    summary: `Delete a ${title}`,
    description: `Answers \`204 No Content\` for a ${title} that exists.\n\n${STATELESS}`,
    request: { params, query: WriteQuery },
    responses: { 204: { description: `The ${title} would have been deleted.` }, ...notFound, ...conflicted },
  });

  /** The dataset a read with the same `seed` and `locale` would see. */
  const dataset = (c: Context) => {
    const query = c.req.query();
    const seed = resource.seeded ? intParam(pick(query, 'seed'), DEFAULT_SEED, MAX_SEED) : DEFAULT_SEED;
    const locale = parseLocale(pick(query, 'locale'));
    contentLanguage(c, locale);
    return resource.load(seed, locale).records as Fields[];
  };
  const find = (c: Context, recordId: string) => resource.find(dataset(c), recordId) as Fields | undefined;
  /** The validated body. The input schema is only known at run time, so its type is a plain record. */
  const sent = (c: Context) => (c.req.valid as (target: 'json') => Fields)('json');
  const notFoundFor = (c: Context, recordId: string) => c.json({ error: `No ${title} with id "${recordId}".` }, 404);
  const conflicting = (c: Context) => flagParam(pick(c.req.query(), 'conflict'), false);
  const changedElsewhere = `This ${title} was changed by someone else. Reload it and try again.`;
  const now = () => new Date().toISOString();

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
      const next = Math.max(-1, ...dataset(c).map((record) => Number(record[resource.idField]))) + 1;
      const at = now();
      c.header('Location', `${c.req.path.replace(/\/+$/, '')}/${next}`);
      return c.json({ [resource.idField]: next, ...sent(c), createdAt: at, updatedAt: at }, 201) as never;
    })
    .openapi(putRoute, (c) => {
      const { id: recordId } = c.req.valid('param');
      const record = find(c, recordId);
      if (!record) return notFoundFor(c, recordId);
      if (conflicting(c)) return c.json({ error: changedElsewhere }, 409);
      const kept = 'createdAt' in record ? { createdAt: record.createdAt } : {};
      return c.json({ [resource.idField]: record[resource.idField], ...sent(c), ...kept, updatedAt: now() }) as never;
    })
    .openapi(patchRoute, (c) => {
      const { id: recordId } = c.req.valid('param');
      const record = find(c, recordId);
      if (!record) return notFoundFor(c, recordId);
      if (conflicting(c)) return c.json({ error: changedElsewhere }, 409);
      return c.json({ ...record, ...sent(c), updatedAt: now() }) as never;
    })
    .openapi(deleteRoute, (c) => {
      const { id: recordId } = c.req.valid('param');
      if (!find(c, recordId)) return notFoundFor(c, recordId);
      if (conflicting(c)) return c.json({ error: changedElsewhere }, 409);
      return c.body(null, 204);
    });
}
