/**
 * CSV, NDJSON and SQL from records. Pure functions with no imports, so the API's `format=csv`, `format=ndjson` and
 * `format=sql`, the playground's downloads and the static API's files write exactly the same text.
 */

/** One JSON object per line, each line ending in `\n`: what `jq -c`, BigQuery, ClickHouse and log tools read. */
export function toNdjson(records: readonly unknown[]): string {
  return records.map((record) => `${JSON.stringify(record ?? null)}\n`).join('');
}

/** A table name `format=sql` accepts: a letter or `_`, then letters, digits or `_`, 63 characters at most. */
export const SQL_TABLE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export class SqlTableError extends Error {
  constructor(name: string) {
    super(
      `"${name}" is not a table name format=sql can write. Use a letter or "_", then letters, digits or "_", up to 63 characters.`,
    );
  }
}

/** An identifier in double quotes, the SQL standard's way, with any `"` inside doubled. */
export const sqlIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * A value as an SQL literal: `NULL`; `TRUE` or `FALSE`; a number as written (a non-finite one as `NULL`); text
 * in single quotes with any `'` doubled; and an object or array as its JSON, quoted as text.
 */
export function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  const text = typeof value === 'string' ? value : value instanceof Date ? value.toISOString() : JSON.stringify(value);
  return `'${text.replaceAll('\0', '').replaceAll("'", "''")}'`;
}

/**
 * One `INSERT INTO "table" ("a", "b") VALUES (…);` per record, columns in the order they first appear. A record
 * without a column inserts `NULL` there. Dialect-neutral: standard double-quoted identifiers, `''` escapes and
 * `TRUE`/`FALSE`, which PostgreSQL, SQLite, DuckDB and MySQL (with `ANSI_QUOTES`) all read.
 */
export function toSql(records: readonly unknown[], table: string): string {
  if (!SQL_TABLE.test(table)) throw new SqlTableError(table);
  const rows = records.map((record) =>
    record && typeof record === 'object' && !Array.isArray(record)
      ? (record as Record<string, unknown>)
      : { value: record },
  );
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const into = `INSERT INTO ${sqlIdentifier(table)} (${columns.map(sqlIdentifier).join(', ')}) VALUES `;
  return rows.map((row) => `${into}(${columns.map((column) => sqlValue(row[column])).join(', ')});\n`).join('');
}

export function csvCell(value: unknown): string {
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

/** Excel reads a CSV without a byte-order mark as Windows-1252, which garbles anything outside ASCII. */
export const CSV_BOM = '\uFEFF';
