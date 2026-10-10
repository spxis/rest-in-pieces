/**
 * `/fhir`: the synthetic patients as FHIR sees them. `GET /fhir/Patient` answers a searchset Bundle, `GET /fhir/Patient/12`
 * the resource, and `GET /fhir/metadata` a CapabilityStatement, with `application/fhir+json` and `OperationOutcome` errors,
 * so a FHIR client library can be pointed here. It is read-only, JSON only and supports the search parameters listed in
 * `SEARCH`; any other is refused rather than ignored, because a search that quietly drops a filter returns the wrong
 * patients. Every page is bounded: `_count` is at most 100.
 *
 * The data is invented: see `data/fhir.ts`.
 */
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  FHIR_VERSION,
  type FhirCondition,
  type FhirEncounter,
  type FhirObservation,
  type FhirPatient,
  loadConditions,
  loadEncounters,
  loadObservations,
  loadPatients,
  SYNTHETIC_TAG,
} from '../data/fhir.ts';
import { FhirBundle, OperationOutcome } from '../fhir.schemas.ts';
import { contentLanguage, type Locale, parseLocale, UnsupportedLocaleError } from '../lib/locale.ts';
import { intParam, pick } from '../lib/query.ts';
import { publicBase } from '../lib/safe.ts';
import { DEFAULT_SEED, MAX_SEED } from '../resources.ts';

export const FHIR_TYPES = ['Patient', 'Observation', 'Condition', 'Encounter'] as const;
type FhirType = (typeof FHIR_TYPES)[number];
type Resource = FhirPatient | FhirObservation | FhirCondition | FhirEncounter;

/** The most entries a Bundle carries. */
export const MAX_COUNT = 100;
export const DEFAULT_COUNT = 10;
const FHIR_JSON = 'application/fhir+json; charset=utf-8';

/** A search the server cannot honour. Answered with `400` and an OperationOutcome. */
class SearchError extends Error {
  readonly code: 'invalid' | 'not-supported';
  constructor(message: string, code: 'invalid' | 'not-supported' = 'invalid') {
    super(message);
    this.code = code;
  }
}

type Predicate = (resource: Resource) => boolean;
type Matcher = (value: string) => Predicate;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const at = (resource: Resource, key: string): unknown => (resource as unknown as Record<string, unknown>)[key];

/** A token parameter: `code`, or `system|code`, any of several separated by commas. */
const token =
  (read: (resource: Resource) => { system?: string; code: string }[]): Matcher =>
  (value) => {
    const wanted = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const bar = part.indexOf('|');
        return bar < 0 ? { code: part } : { system: part.slice(0, bar), code: part.slice(bar + 1) };
      });
    if (wanted.length === 0) throw new SearchError('a search value is empty.');
    return (resource) =>
      read(resource).some((have) =>
        wanted.some(
          (want) =>
            want.code === have.code && (want.system === undefined || want.system === '' || want.system === have.system),
        ),
      );
  };

const codingsOf = (value: unknown): { system?: string; code: string }[] => {
  const concept = (value ?? {}) as { coding?: { system?: string; code: string }[] };
  return concept.coding ?? [];
};
const codingList = (key: string) => (resource: Resource) =>
  ((at(resource, key) ?? []) as unknown[]).flatMap((entry) => codingsOf(entry));
const codingOne = (key: string) => (resource: Resource) => codingsOf(at(resource, key));

/** A reference parameter: `12` or `Patient/12`. */
const patientRef: Matcher = (value) => {
  const id = value.startsWith('Patient/') ? value.slice(8) : value;
  if (!/^\d{1,6}$/.test(id)) throw new SearchError(`"${value}" is not a patient reference such as Patient/12.`);
  return (resource) => (at(resource, 'subject') as { reference?: string } | undefined)?.reference === `Patient/${id}`;
};

const DAY_MS = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** A date parameter: an optional prefix (`eq` `ne` `gt` `lt` `ge` `le`) and a date or date-time. */
const dateParam =
  (read: (resource: Resource) => string | undefined): Matcher =>
  (value) => {
    const match = /^(eq|ne|gt|lt|ge|le)?(.+)$/.exec(value);
    const prefix = match?.[1] ?? 'eq';
    const when = match?.[2] ?? '';
    const parts = DATE.exec(when);
    if (!parts) throw new SearchError(`"${value}" is not a date such as 2025-06-01 or ge2025-06-01T10:00:00Z.`);
    const start = Date.parse(
      when.length === 10
        ? `${when}T00:00:00Z`
        : when.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(when)
          ? when
          : `${when}Z`,
    );
    if (Number.isNaN(start)) throw new SearchError(`"${value}" is not a date.`);
    const end = start + (when.length === 10 ? DAY_MS : 1000);
    return (resource) => {
      const found = read(resource);
      const time = found === undefined ? Number.NaN : Date.parse(found);
      if (Number.isNaN(time)) return false;
      switch (prefix) {
        case 'eq':
          return time >= start && time < end;
        case 'ne':
          return !(time >= start && time < end);
        case 'gt':
          return time >= end;
        case 'lt':
          return time < start;
        case 'ge':
          return time >= start;
        default:
          return time < end;
      }
    };
  };

/** A string parameter: starts with, ignoring case, as FHIR's default. */
const stringParam =
  (read: (resource: Resource) => string[]): Matcher =>
  (value) => {
    const wanted = value.toLowerCase();
    if (wanted === '') throw new SearchError('a search value is empty.');
    return (resource) => read(resource).some((have) => have.toLowerCase().startsWith(wanted));
  };

const idMatcher: Matcher = (value) => {
  const ids = new Set(value.split(',').map((part) => part.trim()));
  return (resource) => ids.has(resource.id);
};

const names = (resource: Resource): { family?: string; given?: string[]; text?: string }[] =>
  (at(resource, 'name') ?? []) as { family?: string; given?: string[]; text?: string }[];

/** The search parameters each type supports, and how each is read. */
const SEARCH: Record<FhirType, Record<string, Matcher>> = {
  Patient: {
    _id: idMatcher,
    identifier: (value) => {
      const wanted = value.includes('|') ? value.slice(value.indexOf('|') + 1) : value;
      return (resource) =>
        ((at(resource, 'identifier') ?? []) as { value?: string }[]).some((id) => id.value === wanted);
    },
    family: stringParam((resource) => names(resource).map((name) => text(name.family))),
    given: stringParam((resource) => names(resource).flatMap((name) => name.given ?? [])),
    name: stringParam((resource) =>
      names(resource).flatMap((name) => [text(name.family), ...(name.given ?? []), text(name.text)]),
    ),
    gender: token((resource) => [{ code: text(at(resource, 'gender')) }]),
    birthdate: dateParam((resource) => text(at(resource, 'birthDate')) || undefined),
    active: token((resource) => [{ code: String(at(resource, 'active')) }]),
  },
  Observation: {
    _id: idMatcher,
    patient: patientRef,
    subject: patientRef,
    code: token(codingOne('code')),
    category: token(codingList('category')),
    status: token((resource) => [{ code: text(at(resource, 'status')) }]),
    date: dateParam((resource) => text(at(resource, 'effectiveDateTime')) || undefined),
  },
  Condition: {
    _id: idMatcher,
    patient: patientRef,
    subject: patientRef,
    code: token(codingOne('code')),
    category: token(codingList('category')),
    'clinical-status': token(codingOne('clinicalStatus')),
    'onset-date': dateParam((resource) => text(at(resource, 'onsetDateTime')) || undefined),
  },
  Encounter: {
    _id: idMatcher,
    patient: patientRef,
    subject: patientRef,
    status: token((resource) => [{ code: text(at(resource, 'status')) }]),
    class: token((resource) => {
      const found = at(resource, 'class') as { system?: string; code: string } | undefined;
      return found ? [found] : [];
    }),
    type: token(codingList('type')),
    date: dateParam((resource) => (at(resource, 'period') as { start?: string } | undefined)?.start),
  },
};

/** Parameters that are not searches: the page, the data, the format, and the latency and error simulation. */
const CONTROL = new Set(['_count', '_offset', '_format', 'seed', 'locale', 'delay', 'trickle', 'fail']);

const LOADERS: Record<FhirType, (seed: number, locale: Locale) => { records: object[] }> = {
  Patient: loadPatients,
  Observation: loadObservations,
  Condition: loadConditions,
  Encounter: loadEncounters,
};

const outcome = (code: string, diagnostics: string, severity: 'error' | 'information' = 'error') => ({
  resourceType: 'OperationOutcome' as const,
  issue: [{ severity, code, diagnostics }],
});

const send = (c: Context, body: object, status: 200 | 400 | 404 = 200) =>
  c.body(JSON.stringify(body), status, { 'Content-Type': FHIR_JSON });

function isType(value: string): value is FhirType {
  return (FHIR_TYPES as readonly string[]).includes(value);
}

/** Reads `_format`: only JSON is served. */
function checkFormat(value: string | undefined): void {
  if (value !== undefined && !['json', 'application/json', 'application/fhir+json'].includes(value)) {
    throw new SearchError(
      `_format "${value}" is not supported: this server answers application/fhir+json only.`,
      'not-supported',
    );
  }
}

function search(type: FhirType, c: Context) {
  const queries = c.req.queries();
  checkFormat(pick(c.req.query(), '_format'));
  const supported = SEARCH[type];
  const predicates: Predicate[] = [];
  for (const [name, values] of Object.entries(queries)) {
    if (CONTROL.has(name)) continue;
    // `status=503` is also how any request here asks for a simulated failure; a FHIR status is a word.
    const matcher = supported[name];
    if (!matcher) {
      throw new SearchError(
        `The search parameter "${name}" is not supported for ${type}. Supported: ${Object.keys(supported).join(', ')}.`,
        'not-supported',
      );
    }
    for (const value of values) predicates.push(matcher(value));
  }
  const query = c.req.query();
  const count = query._count === undefined ? DEFAULT_COUNT : Number(query._count);
  if (!Number.isInteger(count) || count < 0 || count > MAX_COUNT) {
    throw new SearchError(`_count must be a whole number from 0 to ${MAX_COUNT}.`);
  }
  const offset = intParam(query._offset, 0, 1_000_000);
  if (query._offset !== undefined && !/^\d+$/.test(query._offset))
    throw new SearchError('_offset must be a whole number of 0 or more.');
  const seed = intParam(query.seed, DEFAULT_SEED, MAX_SEED);
  const locale = parseLocale(pick(query, 'locale'));
  contentLanguage(c, locale);
  const all = LOADERS[type](seed, locale).records as Resource[];
  const matches =
    predicates.length === 0 ? all : all.filter((resource) => predicates.every((matches) => matches(resource)));
  return { matches, count, offset, locale, seed };
}

const bundleFor = (c: Context, type: FhirType) => {
  const { matches, count, offset } = search(type, c);
  const base = publicBase(c.req.url, c.req.header('x-forwarded-prefix'));
  const page = matches.slice(offset, offset + count);
  const here = new URL(c.req.url);
  const link = (relation: string, from: number) => {
    const url = new URL(here);
    url.searchParams.set('_count', String(count));
    url.searchParams.set('_offset', String(from));
    return { relation, url: `${base}${url.pathname.replace(/^\/+/, '/')}${url.search}` };
  };
  return {
    resourceType: 'Bundle' as const,
    type: 'searchset' as const,
    meta: { tag: [SYNTHETIC_TAG] },
    total: matches.length,
    link: [
      link('self', offset),
      ...(count > 0 && offset + count < matches.length ? [link('next', offset + count)] : []),
      ...(offset > 0 && count > 0 ? [link('previous', Math.max(0, offset - count))] : []),
    ],
    entry: page.map((resource) => ({
      fullUrl: `${base}/fhir/${type}/${resource.id}`,
      resource,
      search: { mode: 'match' as const },
    })),
  };
};

const SEARCH_DOCS = (type: FhirType) =>
  `Search parameters for ${type}: ${Object.keys(SEARCH[type])
    .map((name) => `\`${name}\``)
    .join(
      ', ',
    )}, plus \`_count\` (0 to ${MAX_COUNT}, default ${DEFAULT_COUNT}), \`_offset\`, \`seed\` and \`locale\`. Token parameters take \`code\` or \`system|code\`, several separated by commas; dates take the prefixes \`eq\`, \`ne\`, \`gt\`, \`lt\`, \`ge\` and \`le\`; \`patient\` takes \`12\` or \`Patient/12\`. Any other parameter is a \`400\`.`;

const errorResponses = {
  400: {
    description: 'A search parameter that is not supported, or a value that cannot be read.',
    content: { 'application/fhir+json': { schema: OperationOutcome } },
  },
  404: {
    description: 'No such resource type or resource.',
    content: { 'application/fhir+json': { schema: OperationOutcome } },
  },
};

const searchRoute = createRoute({
  method: 'get',
  path: '/{type}',
  tags: ['Synthetic patients (FHIR R4)'],
  operationId: 'fhirSearch',
  summary: 'Search a FHIR resource type: a searchset Bundle',
  description: `Synthetic, FHIR R4-shaped Patient, Observation, Condition and Encounter resources, invented by rules and seeded: see the data notes at the top of this tag. ${FHIR_TYPES.map(SEARCH_DOCS).join(' ')}`,
  request: {
    params: z.object({ type: z.string().openapi({ example: 'Observation', description: FHIR_TYPES.join(', ') }) }),
    query: z.object({
      _count: z.string().optional().openapi({ example: '20' }),
      _offset: z.string().optional(),
      patient: z
        .string()
        .optional()
        .openapi({ example: 'Patient/12', description: 'Observation, Condition, Encounter.' }),
      code: z.string().optional().openapi({ example: 'heart-rate', description: 'Observation, Condition.' }),
      gender: z.string().optional().openapi({ description: 'Patient.' }),
      birthdate: z.string().optional().openapi({ example: 'ge1980-01-01', description: 'Patient.' }),
      date: z.string().optional().openapi({ example: 'ge2025-06-01', description: 'Observation, Encounter.' }),
      seed: z.string().optional(),
      locale: z.string().optional(),
    }),
  },
  responses: {
    200: { description: 'A searchset Bundle.', content: { 'application/fhir+json': { schema: FhirBundle } } },
    ...errorResponses,
  },
});

const readRoute = createRoute({
  method: 'get',
  path: '/{type}/{id}',
  tags: ['Synthetic patients (FHIR R4)'],
  operationId: 'fhirRead',
  summary: 'Read one FHIR resource',
  request: {
    params: z.object({ type: z.string().openapi({ example: 'Patient' }), id: z.string().openapi({ example: '12' }) }),
    query: z.object({ seed: z.string().optional(), locale: z.string().optional() }),
  },
  responses: {
    200: {
      description: 'The resource.',
      content: { 'application/fhir+json': { schema: z.record(z.string(), z.unknown()).openapi('FhirResource') } },
    },
    ...errorResponses,
  },
});

const metadataRoute = createRoute({
  method: 'get',
  path: '/metadata',
  tags: ['Synthetic patients (FHIR R4)'],
  operationId: 'fhirMetadata',
  summary: 'The CapabilityStatement',
  responses: {
    200: {
      description: 'What this server supports.',
      content: {
        'application/fhir+json': { schema: z.record(z.string(), z.unknown()).openapi('CapabilityStatement') },
      },
    },
  },
});

const capability = () => ({
  resourceType: 'CapabilityStatement',
  status: 'active',
  date: '2026-01-01',
  kind: 'instance',
  publisher: 'REST in Pieces',
  description:
    'Synthetic test data in the shape of FHIR R4. Every record is invented by rules and a seed: none comes from or resembles a real person on purpose, none is de-identified real data, and its codes are not SNOMED CT, LOINC, ICD or CPT. For building and testing software only.',
  meta: { tag: [SYNTHETIC_TAG] },
  software: { name: 'REST in Pieces' },
  fhirVersion: FHIR_VERSION,
  format: ['json'],
  rest: [
    {
      mode: 'server',
      resource: FHIR_TYPES.map((type) => ({
        type,
        interaction: [{ code: 'read' }, { code: 'search-type' }],
        searchParam: Object.keys(SEARCH[type]).map((name) => ({
          name,
          type:
            name === 'birthdate' || name === 'date' || name === 'onset-date'
              ? 'date'
              : name === 'patient' || name === 'subject'
                ? 'reference'
                : ['family', 'given', 'name'].includes(name)
                  ? 'string'
                  : 'token',
        })),
      })),
    },
  ],
});

/** `GET /fhir/metadata`, `/fhir/{type}` and `/fhir/{type}/{id}`. */
export function fhirRoutes() {
  return new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success)
        return send(
          c,
          outcome('invalid', `Invalid request: ${result.error.issues[0]?.message ?? 'unknown problem'}`),
          400,
        );
    },
  })
    .openapi(metadataRoute, (c) => send(c, capability()) as never)
    .openapi(searchRoute, (c) => {
      const { type } = c.req.valid('param');
      if (!isType(type))
        return send(
          c,
          outcome('not-found', `The resource type "${type}" is not supported. Supported: ${FHIR_TYPES.join(', ')}.`),
          404,
        ) as never;
      try {
        return send(c, bundleFor(c, type)) as never;
      } catch (error) {
        if (error instanceof SearchError) return send(c, outcome(error.code, error.message), 400) as never;
        if (error instanceof UnsupportedLocaleError) return send(c, outcome('invalid', error.message), 400) as never;
        throw error;
      }
    })
    .openapi(readRoute, (c) => {
      const { type, id } = c.req.valid('param');
      if (!isType(type))
        return send(
          c,
          outcome('not-found', `The resource type "${type}" is not supported. Supported: ${FHIR_TYPES.join(', ')}.`),
          404,
        ) as never;
      try {
        const query = c.req.query();
        const locale = parseLocale(pick(query, 'locale'));
        contentLanguage(c, locale);
        const found = (LOADERS[type](intParam(query.seed, DEFAULT_SEED, MAX_SEED), locale).records as Resource[]).find(
          (resource) => resource.id === id,
        );
        if (!found)
          return send(c, outcome('not-found', `${type}/${id} does not exist. Ids run from 1 to 1000.`), 404) as never;
        return send(c, found) as never;
      } catch (error) {
        if (error instanceof SearchError || error instanceof UnsupportedLocaleError) {
          return send(c, outcome('invalid', error.message), 400) as never;
        }
        throw error;
      }
    });
}
