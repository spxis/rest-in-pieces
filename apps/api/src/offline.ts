/**
 * `rest-in-pieces generate`: seeded records from a schema or a field list, written one at a time to a file or
 * standard output, in any number, on your own machine. Nothing is hosted, so nothing is billed.
 *
 * It makes the same records as `POST /generate` for the same seed, locale and schema (the first N of a larger run are the
 * N a smaller one makes), and writes them the way the API's formats do: the same JSON, the same CSV cells, the same SQL
 * quoting (`serialize.ts`). Only node-specific code is here (files); everything it draws on is the API's own.
 */

import { once } from 'node:events';
import { createWriteStream, readFileSync, statSync, unlinkSync } from 'node:fs';
import type { Writable } from 'node:stream';
import { parse as parseYaml } from 'yaml';
import { CliError, type GenerateOptions } from './cli.ts';
import {
  columnsOfFields,
  FieldError,
  type GenerateContext,
  parseFieldList,
  SchemaError,
  streamRecords,
} from './data/generators.ts';
import { ExpressionError } from './lib/expression.ts';
import { CSV_BOM, csvCell, plain } from './lib/format.ts';
import { JsonSchemaError, prepareSchema, streamFromSchema } from './lib/jsonschema.ts';
import { parseLocale, UnsupportedLocaleError } from './lib/locale.ts';
import { sqlIdentifier, sqlValue } from './serialize.ts';

/** The largest schema file read. */
export const MAX_SCHEMA_FILE = 5 * 1024 * 1024;
/** Text is handed to the sink in pieces about this large. */
const CHUNK = 64 * 1024;

/** Somewhere text can be written. `write` may be asynchronous, which is how a full pipe slows the run down. */
export interface Sink {
  write(text: string): void | Promise<void>;
}

export interface GenerateResult {
  records: number;
  characters: number;
}

/** Reads a JSON or YAML schema file, saying what is wrong with it in a sentence. */
export function readSchemaFile(
  path: string,
  read: (path: string) => string = (file) => readFileSync(file, 'utf8'),
): unknown {
  let text: string;
  try {
    if (statSync(path).size > MAX_SCHEMA_FILE)
      throw new CliError(`${path} is larger than ${MAX_SCHEMA_FILE / 1024 / 1024} MB.`);
    text = read(path);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(
      `Cannot read ${path}: ${error instanceof Error ? error.message.replace(/^ENOENT: /, '') : 'unknown error'}`,
    );
  }
  try {
    return /\.ya?ml$/i.test(path) ? parseYaml(text) : JSON.parse(text);
  } catch (error) {
    throw new CliError(
      `${path} is not valid ${/\.ya?ml$/i.test(path) ? 'YAML' : 'JSON'}: ${error instanceof Error ? error.message : 'unreadable'}`,
    );
  }
}

const isDocument = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && ('openapi' in value || 'swagger' in value);

/**
 * Writes `options.count` records to `sink` in the format asked for. `schema` is the parsed schema file, when there is one.
 * Throws whatever the API would answer `400` to (`SchemaError`, `FieldError`, `JsonSchemaError`, `ExpressionError`).
 */
export async function generateOffline(options: GenerateOptions, schema: unknown, sink: Sink): Promise<GenerateResult> {
  const locale = parseLocale(options.locale);
  const context: GenerateContext = { safe: options.safe, base: options.safe ? options.baseUrl : '' };
  let records: Iterable<Record<string, unknown>>;
  let columns: string[];
  if (options.fields !== undefined) {
    const fields = parseFieldList(options.fields, options.constraints);
    records = streamRecords(fields, options.count, options.seed, locale, context, options.constraints);
    columns = columnsOfFields(fields);
  } else {
    const prepared = prepareSchema(isDocument(schema) ? { openapi: schema, component: options.component } : { schema });
    records = streamFromSchema(prepared, options.count, options.seed, locale, context);
    columns = prepared.columns;
  }

  let pending = '';
  let characters = 0;
  const emit = async (text: string) => {
    pending += text;
    if (pending.length >= CHUNK) await flush();
  };
  const flush = async () => {
    if (pending === '') return;
    const out = pending;
    pending = '';
    characters += out.length;
    await sink.write(out);
  };

  const { format, table, batch } = options;
  const into = `INSERT INTO ${sqlIdentifier(table)} (${columns.map(sqlIdentifier).join(', ')}) VALUES `;
  const row = (record: Record<string, unknown>) => `(${columns.map((column) => sqlValue(record[column])).join(', ')})`;
  if (format === 'csv' && options.bom) await emit(CSV_BOM);
  if (format === 'csv') await emit(`${columns.map(csvCell).join(',')}\r\n`);
  if (format === 'json') await emit('[\n');
  if (format === 'sql' && options.transaction) await emit('BEGIN;\n');

  let count = 0;
  let group: string[] = [];
  for (const raw of records) {
    const record = plain(raw) as Record<string, unknown>;
    if (format === 'ndjson') await emit(`${JSON.stringify(record)}\n`);
    else if (format === 'json') await emit(`${count === 0 ? '' : ',\n'}${JSON.stringify(record)}`);
    else if (format === 'csv') await emit(`${columns.map((column) => csvCell(record[column])).join(',')}\r\n`);
    else {
      group.push(row(record));
      if (group.length === batch) {
        await emit(`${into}${group.join(',\n  ')};\n`);
        group = [];
      }
    }
    count++;
  }
  if (group.length > 0) await emit(`${into}${group.join(',\n  ')};\n`);
  if (format === 'json') await emit(count === 0 ? ']\n' : '\n]\n');
  if (format === 'sql' && options.transaction) await emit('COMMIT;\n');
  await flush();
  return { records: count, characters };
}

/** Whether an error is the request's own fault (a bad schema, field list or locale) rather than a bug. */
const isUserError = (error: unknown): boolean =>
  error instanceof CliError ||
  error instanceof SchemaError ||
  error instanceof FieldError ||
  error instanceof ExpressionError ||
  error instanceof JsonSchemaError ||
  error instanceof UnsupportedLocaleError;

/** A sink over a stream that waits for it to drain, so a slow disk or pipe slows the run instead of filling memory. */
function streamSink(stream: Writable): Sink {
  return {
    async write(text) {
      if (!stream.write(text)) await once(stream, 'drain');
    },
  };
}

export interface GenerateIo {
  /** Where records go when no `--output` is given. */
  stdout: Writable;
  /** Where the summary and errors go. */
  stderr: (text: string) => void;
}

/**
 * Runs `rest-in-pieces generate`: reads the schema, writes the records, and returns the exit code: 0 on success, 1 when
 * the schema or field list cannot be used. A file that was being written when it failed is removed.
 */
export async function runGenerateCommand(command: GenerateOptions, io: GenerateIo): Promise<number> {
  const started = performance.now();
  let file: Writable | undefined;
  try {
    const schema = command.schema === undefined ? undefined : readSchemaFile(command.schema);
    file = command.output === undefined ? undefined : createWriteStream(command.output, { encoding: 'utf8' });
    const target = file ?? io.stdout;
    // A reader that stops early (`| head`) closes the pipe: that is a finished run, not a failure.
    let closed = false;
    target.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE') closed = true;
    });
    const sink = streamSink(target);
    const result = await generateOffline(command, schema, {
      write: async (text) => {
        if (!closed) await sink.write(text);
      },
    });
    if (file) {
      file.end();
      await once(file, 'finish');
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      io.stderr(
        `Wrote ${result.records.toLocaleString('en-US')} records (${(result.characters / 1_000_000).toFixed(1)} MB) to ${command.output} in ${seconds} s.\n`,
      );
    }
    return 0;
  } catch (error) {
    if (file) {
      file.destroy();
      if (command.output !== undefined) {
        try {
          unlinkSync(command.output);
        } catch {
          // Nothing was written, or it is already gone.
        }
      }
    }
    if (!isUserError(error)) throw error;
    io.stderr(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
