/**
 * CSV, NDJSON and SQL from records. Pure functions with no imports, so the API's `format=csv`, `format=ndjson` and
 * `format=sql`, the playground's downloads and the static API's files write exactly the same text.
 */

/** One JSON object per line, each line ending in `\n`: what `jq -c`, BigQuery, ClickHouse and log tools read.
 *
 * @param records - Records in output order; null or undefined records are written as JSON null.
 *
 * @returns One JSON value per line, with a final newline for each record; an empty input returns an empty string.
 *
 * @example
 * ```ts
 * import { toNdjson } from "@johnmorrisdotca/rest-in-pieces/serialize";
 *
 * console.log(toNdjson([{ id: 1, name: "Ada" }, { id: 2, name: "Grace" }]).trim());
 * ```
 */
export function toNdjson(records: readonly unknown[]): string {
  return records.map((record) => `${JSON.stringify(record ?? null)}\n`).join('');
}

/** A table name `format=sql` accepts: a letter or `_`, then letters, digits or `_`, 63 characters at most.
 *
 * @example
 * ```ts
 * import { SQL_TABLE } from "@johnmorrisdotca/rest-in-pieces/serialize";
 *
 * console.log(SQL_TABLE.test("people"), SQL_TABLE.test("bad-name"));
 * ```
 */
export const SQL_TABLE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/**
 *
 * An invalid table identifier refused by toSql and the API SQL export. The supported identifier starts with a letter or underscore and has at most 63 characters.
 *
 * @param name - The rejected table identifier, included in the error message.
 *
 * @example
 * ```ts
 * import { SqlTableError, toSql } from "@johnmorrisdotca/rest-in-pieces/serialize";
 *
 * try { toSql([{ id: 1 }], "bad-name"); } catch (error) { console.log(error instanceof SqlTableError); }
 * ```
 */
export class SqlTableError extends Error {
  constructor(name: string) {
    super(
      `"${name}" is not a table name format=sql can write. Use a letter or "_", then letters, digits or "_", up to 63 characters.`,
    );
  }
}

/** An identifier in double quotes, the SQL standard's way, with any `"` inside doubled.
 *
 * @param name - An identifier to quote; this helper escapes quotes but does not validate a table name.
 *
 * @returns A double-quoted identifier with embedded double quotes escaped.
 *
 * @example
 * ```ts
 * import { sqlIdentifier } from "@johnmorrisdotca/rest-in-pieces/serialize";
 *
 * console.log(sqlIdentifier("people"));
 * ```
 */
export const sqlIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * A value as an SQL literal: `NULL`; `TRUE` or `FALSE`; a number as written (a non-finite one as `NULL`); text
 * in single quotes with any `'` doubled; and an object or array as its JSON, quoted as text.
 *
 * @param value - The value to serialize; null, undefined and non-finite numbers become the SQL literal NULL.
 *
 * @returns An SQL literal, including NULL for null, undefined and non-finite numbers; objects and arrays are quoted JSON text.
 *
 * @example
 * ```ts
 * import { sqlValue } from "@johnmorrisdotca/rest-in-pieces/serialize";
 *
 * console.log(sqlValue(null), sqlValue("O'Reilly"), sqlValue({ id: 1 }));
 * ```
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
 *
 * @param records - Records in output order; missing columns insert NULL, and non-object records use a value column.
 *
 * @param table - A valid table identifier: a letter or underscore, followed by letters, digits or underscores, at most 63 characters.
 *
 * @returns One SQL INSERT statement per record, ending with a newline; an empty record list returns an empty string after validating table.
 *
 * @example
 * ```ts
 * import { toSql } from "@johnmorrisdotca/rest-in-pieces/serialize";
 *
 * console.log(toSql([{ id: 1, name: "Ada" }, { id: 2, name: null }], "people").trim());
 * ```
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

/**
 *
 * A value as one CSV cell: null and undefined are blank, nested values are JSON, and commas, quotes, newlines or surrounding whitespace cause quoting.
 *
 * @param value - The value to write as a CSV cell; null and undefined become an empty cell.
 *
 * @returns A quoted or unquoted CSV cell; null and undefined return an empty string.
 *
 * @example
 * ```ts
 * import { csvCell } from "@johnmorrisdotca/rest-in-pieces/serialize";
 *
 * console.log(csvCell("Ada, Grace"), csvCell(null));
 * ```
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV. A table has no room for metadata, so only the records are written; nested values become JSON.
 *
 * @param records - Records in output order; all encountered keys define the column order and nested values become JSON.
 *
 * @returns CSV text with a header and CRLF line endings, or an empty string when there are no columns to write.
 *
 * @example
 * ```ts
 * import { toCsv } from "@johnmorrisdotca/rest-in-pieces/serialize";
 *
 * console.log(toCsv([{ id: 1, name: "Ada" }, { id: 2, name: "Grace" }]).trim());
 * ```
 */
export function toCsv(records: readonly unknown[]): string {
  const rows = records.map((record) => (record && typeof record === 'object' ? record : { value: record }));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (columns.length === 0) return '';
  const lines = rows.map((row) => columns.map((column) => csvCell((row as Record<string, unknown>)[column])).join(','));
  return `${[columns.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
}

/** Excel reads a CSV without a byte-order mark as Windows-1252, which garbles anything outside ASCII.
 *
 * @example
 * ```ts
 * import { CSV_BOM } from "@johnmorrisdotca/rest-in-pieces/serialize";
 *
 * console.log(CSV_BOM.codePointAt(0));
 * ```
 */
export const CSV_BOM = '\uFEFF';
