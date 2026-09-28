import { XMLBuilder } from 'fast-xml-parser';
import type { MiddlewareHandler } from 'hono';
import { stringify } from 'yaml';
import { flagParam, intParam, pick } from './query.ts';

type OutputFormat = 'json' | 'csv' | 'yaml' | 'xml';

const FORMATS = new Set<OutputFormat>(['csv', 'yaml', 'xml']);
const XML_BUILDER = new XMLBuilder({ format: true, suppressEmptyNode: true });

function requestedFormat(queryFormat: string | undefined, accept: string | undefined): OutputFormat | null {
  if (queryFormat) {
    const normalized = queryFormat.toLowerCase();
    if (normalized === 'json') return 'json';
    return FORMATS.has(normalized as OutputFormat) ? (normalized as OutputFormat) : null;
  }
  const normalizedAccept = accept?.toLowerCase();
  if (normalizedAccept?.includes('text/csv')) return 'csv';
  if (
    normalizedAccept?.includes('application/yaml') ||
    normalizedAccept?.includes('text/yaml') ||
    normalizedAccept?.includes('application/x-yaml')
  ) {
    return 'yaml';
  }
  if (normalizedAccept?.includes('application/xml') || normalizedAccept?.includes('text/xml')) return 'xml';
  return null;
}

function csvValue(value: unknown): string {
  const text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(value: unknown): string {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? (Object.values(value).find(Array.isArray) ?? [value])
      : [value];
  if (rows.length === 0) return '';
  const columns = [...new Set(rows.filter((row) => row && typeof row === 'object').flatMap(Object.keys))];
  if (columns.length === 0) return rows.map(csvValue).join('\r\n');
  return [
    columns.map(csvValue).join(','),
    ...rows.map((row) => columns.map((column) => csvValue(row?.[column])).join(',')),
  ].join('\r\n');
}

function serialize(value: unknown, format: OutputFormat): string {
  if (format === 'csv') return toCsv(value);
  if (format === 'yaml') return stringify(value);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${XML_BUILDER.build({ response: value })}`;
}

function withStatus(response: Response, status: number): Response {
  const headers = new Headers(response.headers);
  if ([204, 205, 304].includes(status)) {
    headers.delete('content-length');
    return new Response(null, { status, headers });
  }
  return new Response(response.body, { status, headers });
}

export const responseControls: MiddlewareHandler = async (c, next) => {
  const query = c.req.query();
  const formatValue = pick(query, 'format')?.toLowerCase();
  const format = requestedFormat(formatValue, c.req.header('accept'));
  if (formatValue && !format) return c.json({ error: 'Unsupported format. Use csv, yaml, or xml.' }, 400);

  const delay = intParam(pick(query, 'delay'), 0, 10_000);
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

  let response: Response;
  if (flagParam(pick(query, 'fail'), false)) {
    const requestedStatus = intParam(pick(query, 'status'), 500, 599);
    const status = requestedStatus >= 400 ? requestedStatus : 500;
    response = new Response(JSON.stringify({ error: 'Simulated failure' }), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } else {
    await next();
    response = c.res;
    const statusValue = pick(query, 'status');
    if (statusValue !== undefined) {
      const status = intParam(statusValue, response.status, 599);
      if (status >= 200) response = withStatus(response, status);
    }
  }

  if (
    !format ||
    format === 'json' ||
    [204, 205, 304].includes(response.status) ||
    !response.headers.get('content-type')?.includes('application/json')
  ) {
    if (response !== c.res) c.res = response;
    return response;
  }
  const value = await response.json();
  const headers = new Headers(response.headers);
  headers.set(
    'content-type',
    format === 'csv'
      ? 'text/csv; charset=utf-8'
      : format === 'yaml'
        ? 'application/yaml; charset=utf-8'
        : 'application/xml; charset=utf-8',
  );
  headers.delete('content-length');
  const formatted = new Response(serialize(value, format), { status: response.status, headers });
  c.res = formatted;
  return formatted;
};
