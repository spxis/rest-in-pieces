/**
 * Downloads of a response: JSON, CSV and plain text. They are built in the browser from what the API
 * already answered, so a download costs no second request and matches the table exactly.
 */

export type DownloadFormat = 'json' | 'csv' | 'txt';
export const DOWNLOAD_FORMATS: readonly DownloadFormat[] = ['json', 'csv', 'txt'];

type Row = Record<string, unknown>;

export interface DownloadSource {
  /** The request URL; its path names the file. */
  url: string;
  /** Records found in the body, or null when it holds none (an error, a CSV body, an empty one). */
  rows: Row[] | null;
  /** The parsed body when it was JSON. */
  json: unknown;
  /** The body as received. */
  raw: string;
  contentType: string;
}

export interface Download {
  filename: string;
  mime: string;
  text: string;
}

/** Every column any row has, in the order they first appear. */
export function columnsOf(rows: readonly Row[]): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))];
}

/** A value as one cell: nested values as JSON, null and missing as nothing. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** RFC 4180 CSV, with CRLF line ends and every field that needs it quoted. */
export function toCsv(rows: readonly Row[]): string {
  const columns = columnsOf(rows);
  const field = (text: string) =>
    /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  return [columns, ...rows.map((row) => columns.map((column) => cellText(row[column])))]
    .map((line) => line.map(field).join(','))
    .join('\r\n')
    .concat('\r\n');
}

/** How many columns a character takes in a monospaced font: two for East Asian wide and full-width ones. */
function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x1100) return 1;
  return /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u.test(char)
    ? 2
    : 1;
}

const widthOf = (text: string) => [...text].reduce((sum, char) => sum + charWidth(char), 0);
const MAX_CELL = 48;

/** One line, cut to fit: newlines and tabs become spaces, and a long value ends in an ellipsis. */
function fitCell(value: unknown): string {
  const text = cellText(value).replace(/[\r\n\t]+/g, ' ');
  if (widthOf(text) <= MAX_CELL) return text;
  let out = '';
  for (const char of text) {
    if (widthOf(out) + charWidth(char) > MAX_CELL - 1) break;
    out += char;
  }
  return `${out}…`;
}

/** A plain-text table, aligned for a monospaced font, as a terminal or a notes app shows it. */
export function toText(rows: readonly Row[]): string {
  const columns = columnsOf(rows);
  const cells = rows.map((row) => columns.map((column) => fitCell(row[column])));
  const widths = columns.map((column, i) => Math.max(widthOf(column), ...cells.map((line) => widthOf(line[i] ?? ''))));
  const pad = (text: string, width: number) => text + ' '.repeat(width - widthOf(text));
  const line = (values: readonly string[]) =>
    values
      .map((value, i) => pad(value, widths[i] ?? 0))
      .join('  ')
      .trimEnd();
  return [line(columns), widths.map((width) => '-'.repeat(width)).join('  '), ...cells.map(line)]
    .join('\n')
    .concat('\n');
}

/** `users`, `users-42`: the file is named after what was asked for. */
export function fileStem(url: string): string {
  let path = url;
  try {
    path = new URL(url, 'http://base.invalid').pathname;
  } catch {
    // Keep the text as given.
  }
  const parts = path.split('/').filter(Boolean).slice(-2);
  const tail =
    parts.length === 2 && /^(names|users|products|companies|countries|random-names|generate|auth)$/.test(parts[0] ?? '')
      ? parts
      : parts.slice(-1);
  return tail.join('-').replace(/[^\w.-]+/g, '-') || 'response';
}

/** The download in a format, or null when the response has nothing to give in it. */
export function downloadOf(source: DownloadSource, format: DownloadFormat): Download | null {
  const filename = `${fileStem(source.url)}.${format}`;
  const { rows, json, raw, contentType } = source;
  if (format === 'json') {
    if (json !== null && json !== undefined)
      return { filename, mime: 'application/json', text: `${JSON.stringify(json, null, 2)}\n` };
    return rows ? { filename, mime: 'application/json', text: `${JSON.stringify(rows, null, 2)}\n` } : null;
  }
  if (format === 'csv') {
    if (rows && rows.length > 0) return { filename, mime: 'text/csv', text: toCsv(rows) };
    return contentType.includes('csv') && raw ? { filename, mime: 'text/csv', text: raw } : null;
  }
  if (rows && rows.length > 0) return { filename, mime: 'text/plain', text: toText(rows) };
  return raw ? { filename, mime: 'text/plain', text: raw.endsWith('\n') ? raw : `${raw}\n` } : null;
}

/** Hands the browser a file to save. */
export function saveDownload({ filename, mime, text }: Download): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
