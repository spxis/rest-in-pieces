import { XMLBuilder } from 'fast-xml-parser';
import type { Context } from 'hono';
import { stringify as toYaml } from 'yaml';

export const FORMATS = ['json', 'csv', 'yaml', 'xml'] as const;
export type Format = (typeof FORMATS)[number];

const MEDIA_TYPES: Record<Format, string> = {
  json: 'application/json; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  yaml: 'application/yaml; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
};

export class UnsupportedFormatError extends Error {
  constructor(format: string) {
    super(`Unsupported format "${format}". Use json, csv, yaml or xml.`);
  }
}

/** `?format=` wins, then the Accept header; JSON is the default. */
export function negotiateFormat(format: string | undefined, accept: string | undefined): Format {
  if (format) {
    const normalized = format.toLowerCase() === 'yml' ? 'yaml' : format.toLowerCase();
    if (!FORMATS.includes(normalized as Format)) throw new UnsupportedFormatError(format);
    return normalized as Format;
  }
  const header = accept?.toLowerCase() ?? '';
  if (header.includes('text/csv')) return 'csv';
  if (/\b(application|text)\/(x-)?yaml\b/.test(header)) return 'yaml';
  if (/\b(application|text)\/xml\b/.test(header)) return 'xml';
  return 'json';
}

/** Converts values JSON cannot represent (Dates, BigInts) into strings. */
export function plain(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, plain(inner)]));
  }
  return value;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV. A table has no room for metadata, so only the records are written; nested values become JSON. */
export function toCsv(records: readonly unknown[]): string {
  const rows = records.map((record) => (record && typeof record === 'object' ? record : { value: record }));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (columns.length === 0) return '';
  const lines = rows.map((row) => columns.map((column) => csvCell((row as Record<string, unknown>)[column])).join(','));
  return `${[columns.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
}

const XML_NAME = /^[A-Za-z_][\w.-]*$/;

/** Makes a key usable as an element name, e.g. `1st` becomes `_1st`. */
function xmlName(key: string): string {
  if (XML_NAME.test(key) && !/^xml/i.test(key)) return key;
  const cleaned = key.replace(/[^\w.-]/g, '_');
  return XML_NAME.test(cleaned) && !/^xml/i.test(cleaned) ? cleaned : `_${cleaned}`;
}

/** XML has no arrays, so each array becomes a list of `<item>` elements under a single parent. */
function toXmlShape(value: unknown): unknown {
  if (Array.isArray(value)) return { item: value.map(toXmlShape) };
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [xmlName(key), toXmlShape(inner)]));
  }
  return value;
}

const xmlBuilder = new XMLBuilder({ format: true, suppressEmptyNode: true, processEntities: true });

export function toXml(body: unknown): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBuilder.build({ response: toXmlShape(body) })}`;
}

/**
 * Sends `body` in the negotiated format. CSV writes `records` (the page) rather than the envelope.
 * Throws UnsupportedFormatError for an unknown `?format=`.
 */
export function requestedFormat(c: Context): Format {
  return negotiateFormat(c.req.query('format'), c.req.header('accept'));
}

export function respond(c: Context, body: unknown, records: readonly unknown[]) {
  const format = requestedFormat(c);
  const data = plain(body);
  c.header('Vary', 'Accept');
  switch (format) {
    case 'csv':
      return c.body(toCsv(plain(records) as unknown[]), 200, { 'Content-Type': MEDIA_TYPES.csv });
    case 'yaml':
      return c.body(toYaml(data), 200, { 'Content-Type': MEDIA_TYPES.yaml });
    case 'xml':
      return c.body(toXml(data), 200, { 'Content-Type': MEDIA_TYPES.xml });
    default:
      return c.json(data as object);
  }
}
