import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  type FieldSpec,
  generateRecords,
  MAX_CONSTRAINTS,
  MAX_FIELDS,
  parseConstraintList,
  parseFieldList,
  SAFE_TYPES,
  SchemaError,
  validateFields,
} from '../data/generators.ts';
import { buildBody, MAX_RECORDS, pageLinks, queryCollection, setPaginationHeaders } from '../lib/collection.ts';
import { requestedFormat, respond } from '../lib/format.ts';
import { contentLanguage, parseLocale } from '../lib/locale.ts';
import { intParam, pick } from '../lib/query.ts';
import { publicBase, wantsSafe } from '../lib/safe.ts';
import { DEFAULT_SEED, MAX_SEED } from '../resources.ts';
import {
  ErrorBody,
  FILTER_DOCS,
  GeneratedRecord,
  ListQuery,
  listOf,
  SAFE_DOCS,
  TABLE_DOCS,
  TEXT_FORMATS,
} from '../schemas.ts';

/** How a field's type is written, for the docs. */
export const FIELD_SYNTAX_DOCS =
  'A type may take arguments, choices and a blank rate:\n\n' +
  '- `age:number.int(18,65)`, `price:commerce.price(5,500,2)`, `joined:date.between(2020-01-01,2025-12-31)`: ' +
  'arguments in parentheses, in the order `GET /generators` lists them under `parameters`.\n' +
  '- `status:pick(active,paused,closed)`: one of the choices, evenly; `pick(active,paused,closed|70,20,10)` ' +
  'weights them, one weight per choice. Choices are text, at most 50 of up to 64 characters.\n' +
  '- `nickname:person.firstName?blank=15`: `null` in about 15% of records (`15%` works too, written `15%25` in a URL).\n' +
  '- `score:number.normal(70,10,0,100,1)`, `income:number.lognormal(50000,0.5)`, `wait:number.exponential(5)`, ' +
  '`rank:number.zipf(1000,1)`: values that bunch the way real ones do. `normal` and `lognormal` redraw a value outside ' +
  '`min`/`max` up to 20 times and then clamp it.\n' +
  "- `age:=age(born)`, `end:=addDays(start, days)`, `full:=concat(first, ' ', last)`: a derived field, written `=` and an " +
  "expression over the record's other fields (and `index`), worked out after they are made. Numbers, text, true/false, " +
  'null and dates; `+ - * / %`, comparisons, `&& || !`, `a ? b : c`, and the functions `GET /generators` lists under ' +
  '`functions`. It cannot loop, assign or reach anything outside the record: at most 400 characters, 150 tokens, 12 deep, ' +
  '100 parts and 10 derived fields. A step that cannot be worked out gives `null`. Write `+` as `%2B` in a URL.\n\n' +
  '`constraints=end>start,total>=subtotal` (also `end after start`, `start<end`) puts pairs of fields in order by ' +
  'swapping them, and moves the later one on (a day for dates, one for numbers) when a strict constraint finds them equal. ' +
  `At most ${MAX_CONSTRAINTS}; they cannot name a derived field or form a loop.\n\n` +
  'Commas inside parentheses belong to the arguments. A type that takes no arguments, a wrong count, a value out ' +
  'of range or a bad weight answers `422` with `error` and the `field` it is about; an unknown type answers `400`. ' +
  `With \`safe=true\`, these types come from the safe ranges: ${SAFE_TYPES.map((t) => `\`${t}\``).join(', ')}; ` +
  'any email inside other text moves to an example domain.';

const DEFAULTS = { limit: 10, metadata: true };

const listResponses = {
  200: {
    description: 'A page of generated records. Each record has an `index` plus the requested fields.',
    content: { 'application/json': { schema: listOf(GeneratedRecord, 'Generated') }, ...TEXT_FORMATS },
  },
  400: {
    description:
      'Invalid field list or generator type, an expression or constraint that cannot be read or goes past a limit, or a cursor that is invalid or belongs to another query.',
    content: { 'application/json': { schema: ErrorBody } },
  },
  422: {
    description: 'A field whose arguments, choices or blank rate cannot be used. `field` names it.',
    content: {
      'application/json': {
        schema: z.object({ error: z.string(), field: z.string() }).openapi('FieldError', {
          example: {
            error: 'Field "age": max must be from -1000000000000000 to 1000000000000000; got 1e99.',
            field: 'age',
          },
        }),
      },
    },
  },
};

const extraQuery = {
  safe: z.string().optional().openapi({ description: SAFE_DOCS }),
  table: z.string().optional().openapi({ description: TABLE_DOCS }),
};

const getRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Custom data'],
  operationId: 'generate',
  summary: 'Generate records from a field list',
  description: `Describe each field as \`name:generatorType\`, comma-separated. Every paging, sorting, filtering, format and simulation parameter works here too.\n\n${FIELD_SYNTAX_DOCS}\n\n${FILTER_DOCS}`,
  request: {
    query: ListQuery.extend({
      ...extraQuery,
      fields: z.string().optional().openapi({
        example:
          'name:person.fullName,age:number.int(18,65),status:pick(active,paused,closed|70,20,10),nickname:person.firstName?blank=15',
      }),
      count: z.string().optional().openapi({ description: 'Dataset size, 1 to 1000. Defaults to `max`, or 1000.' }),
      constraints: z.string().optional().openapi({
        description:
          'Comma-separated rules between two fields: `end>start`, `total>=subtotal`, `start<end` or `end after start`. See the field syntax above.',
        example: 'end>start',
      }),
    }),
  },
  responses: listResponses,
});

const FieldsBody = z
  .union([
    z
      .record(z.string(), z.string())
      .openapi({ example: { name: 'person.fullName', age: 'number.int(18,65)', status: 'pick(active,paused|80,20)' } }),
    z.array(z.object({ name: z.string(), type: z.string() })).max(MAX_FIELDS),
  ])
  .openapi({
    description: 'Either `{ "field": "generatorType" }` or `[{ "name": "field", "type": "generatorType" }]`.',
  });

const GenerateRequest = z
  .object({
    fields: FieldsBody,
    constraints: z
      .array(z.string().max(100))
      .max(MAX_CONSTRAINTS)
      .optional()
      .openapi({
        description: 'Rules between two fields, such as `end > start`. See the field syntax above.',
        example: ['end > start'],
      }),
    count: z.number().int().min(1).max(MAX_RECORDS).optional().openapi({ example: 100 }),
    seed: z.number().int().min(0).max(MAX_SEED).optional().openapi({ example: 42 }),
  })
  .openapi('GenerateRequest');

const postRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Custom data'],
  operationId: 'generatePost',
  summary: 'Generate records from a JSON schema',
  description: `Send the schema as JSON. Paging, sorting, filtering, format and simulation parameters stay in the query string.\n\n${FIELD_SYNTAX_DOCS}`,
  request: {
    query: ListQuery.extend(extraQuery),
    body: { required: true, content: { 'application/json': { schema: GenerateRequest } } },
  },
  responses: listResponses,
});

function toFieldSpecs(fields: z.infer<typeof FieldsBody>): FieldSpec[] {
  return Array.isArray(fields) ? fields : Object.entries(fields).map(([name, type]) => ({ name, type }));
}

/** `GET` and `POST /generate`. `safe` serves safe values unless a request says `safe=false`. */
export function generateRoutes({ safe = false }: { safe?: boolean } = {}) {
  const send = (c: Context, fields: FieldSpec[], count: number, seed: number, constraints: string[]) => {
    requestedFormat(c);
    const query = c.req.query();
    const locale = parseLocale(pick(query, 'locale'));
    contentLanguage(c, locale);
    const context = wantsSafe(query, safe)
      ? { safe: true, base: publicBase(c.req.url, c.req.header('x-forwarded-prefix')) }
      : { safe: false, base: '' };
    const page = queryCollection(
      generateRecords(fields, count, seed, locale, context, constraints),
      query,
      DEFAULTS,
      locale,
      {
        seed,
        keep: ['index'],
      },
    );
    const links = pageLinks(c, page);
    setPaginationHeaders(c, links, page.total);
    return respond(c, buildBody(page, links, { generatedAt: new Date(), seed, locale }), page.records, 'generated');
  };

  return new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        const issue = result.error.issues[0];
        const where = issue?.path.length ? ` at "${issue.path.join('.')}"` : '';
        return c.json({ error: `Invalid request${where}: ${issue?.message ?? 'unknown problem'}` }, 400);
      }
    },
  })
    .openapi(getRoute, (c) => {
      const query = c.req.query();
      const list = pick(query, 'fields');
      if (!list) throw new SchemaError('Add a fields parameter, e.g. fields=name:person.fullName,email:internet.email');
      const count = intParam(pick(query, 'count', 'max', 'maxRecords'), MAX_RECORDS, MAX_RECORDS);
      const seed = intParam(pick(query, 'seed'), DEFAULT_SEED, MAX_SEED);
      const constraints = parseConstraintList(pick(query, 'constraints'));
      return send(c, parseFieldList(list, constraints), Math.max(count, 1), seed, constraints) as never;
    })
    .openapi(postRoute, (c) => {
      const body = c.req.valid('json');
      const constraints = body.constraints ?? [];
      const fields = validateFields(toFieldSpecs(body.fields), constraints);
      return send(c, fields, body.count ?? MAX_RECORDS, body.seed ?? DEFAULT_SEED, constraints) as never;
    });
}
