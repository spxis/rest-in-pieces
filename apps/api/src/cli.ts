/** Argument parsing for the `rest-in-pieces` command, kept apart from the server so it can be tested alone. */

/** The most records `generate` writes in one run. They are made one at a time, so the limit is a safeguard, not memory. */
export const MAX_OFFLINE_RECORDS = 10_000_000;
export const MAX_SEED = 2 ** 32 - 1;

export const DEFAULT_PORT = 6800;
export const DEFAULT_HOST = 'localhost';

export const usage = `Usage: rest-in-pieces [serve] [options]

Starts the REST in Pieces API, with the playground and the API docs on the same address.

Options:
  --port <number>  Port to listen on (default: $PORT, then ${DEFAULT_PORT})
  --host <name>    Address to listen on (default: ${DEFAULT_HOST}; 0.0.0.0 for every interface)
  --openapi <file> Mock the API an OpenAPI 3.x or Swagger 2.0 document (JSON or YAML) describes, instead of the
                   built-in datasets: every operation answers with seeded data in the shape of its response schema
  --session        Keep writes in memory until POST /reset (default: $REST_IN_PIECES_SESSION, then off)
  --safe           Serve safe values unless a request says safe=false: example-domain emails and URLs,
                   fiction-range phone numbers, test card numbers, documentation IPs, self-hosted
                   avatars (default: $REST_IN_PIECES_SAFE, then off; the default from 3.0)
  -v, --version    Print the version
  -h, --help       Print this help

Mock your own API:
  rest-in-pieces serve --openapi ./openapi.yaml

Offline data, with no server to run or pay for:
  rest-in-pieces generate --schema people.json --count 100000 --format sql > people.sql
  rest-in-pieces generate --help       Everything generate takes`;

export const generateUsage = `Usage: rest-in-pieces generate (--schema <file> | --fields <list>) [options]

Writes seeded records to a file or to standard output, one at a time, so any number fit: nothing is held in memory.
The same seed, locale and schema give the same records as POST /generate, and the same on every machine.

Input (one of):
  --schema <file>      A JSON Schema, or an OpenAPI document, as JSON or YAML (.yaml, .yml)
  --fields <list>      A field list, as for GET /generate: name:person.fullName,age:number.int(18,65)

Options:
  --component <name>   The schema to use in an OpenAPI document's components.schemas (optional when there is one)
  --constraints <list> With --fields: end>start,total>=subtotal
  --count <n>          Records to write, 1 to ${MAX_OFFLINE_RECORDS.toLocaleString('en-US')} (default 1000)
  --seed <n>           Seed, 0 to ${MAX_SEED.toLocaleString('en-US')} (default 1)
  --format <name>      ndjson (default), json, csv or sql
  --table <name>       sql: the table to insert into (default records)
  --batch <n>          sql: records per INSERT, 1 to 1000 (default 1: one INSERT per record)
  --transaction        sql: wrap the statements in BEGIN; and COMMIT;
  --bom                csv: start with a UTF-8 byte-order mark, which Excel needs for non-ASCII text
  --locale <code>      The data locale, as GET /locales lists them (default en-CA; global mixes them)
  --safe               Safe values: example-domain emails, fiction-range phones, test card numbers
  --base-url <url>     With --safe: where avatar and image links point (default http://localhost:6800)
  --output <file>      Write here instead of standard output (a summary then goes to standard error)
  -h, --help           Print this help`;

export type CliCommand =
  | { kind: 'serve'; port: number; host: string; session: boolean; safe: boolean; openapi?: string }
  | ({ kind: 'generate' } & GenerateOptions)
  | { kind: 'help' }
  | { kind: 'help-generate' }
  | { kind: 'version' };

/**
 * The environment the command reads: `PORT`, `REST_IN_PIECES_SESSION` to keep writes, and `REST_IN_PIECES_SAFE`
 * for safe values.
 */
export interface CliEnv {
  PORT?: string | undefined;
  REST_IN_PIECES_SESSION?: string | undefined;
  REST_IN_PIECES_SAFE?: string | undefined;
  REST_IN_PIECES_STREAMS?: string | undefined;
}

/** A switch in the environment: on for any value but empty, `0`, `false`, `no` or `off`. */
const switchedOn = (raw: string | undefined) => {
  const value = raw?.trim().toLowerCase();
  return value !== undefined && !['', '0', 'false', 'no', 'off'].includes(value);
};

/** Whether `REST_IN_PIECES_SESSION` turns the session on: any value but empty, `0`, `false`, `no` or `off`. */
export const sessionFromEnv = (env: CliEnv): boolean => switchedOn(env.REST_IN_PIECES_SESSION);

/** Whether the live streams are served: on unless `REST_IN_PIECES_STREAMS` is `0`, `false`, `no` or `off`. */
export const streamsFromEnv = (env: CliEnv): boolean => {
  const raw = env.REST_IN_PIECES_STREAMS?.trim();
  return raw === undefined || raw === '' || switchedOn(raw);
};

/** Whether `REST_IN_PIECES_SAFE` turns safe values on, read the same way. */
export const safeFromEnv = (env: CliEnv): boolean => switchedOn(env.REST_IN_PIECES_SAFE);

/** A mistake in the command line, reported with the usage text rather than a stack trace. */
export class CliError extends Error {}

function parsePort(value: string, from: string): number {
  const port = Number(value);
  if (!/^\d+$/.test(value) || port > 65535) throw new CliError(`${from} must be a port number from 0 to 65535.`);
  return port;
}

export function parseCliArgs(args: readonly string[], env: CliEnv = {}): CliCommand {
  if (args[0] === 'generate') return parseGenerateArgs(args.slice(1));
  // `serve` is the command spelled out: the options are the same without it.
  const argv = args[0] === 'serve' ? args.slice(1) : args;
  let openapi: string | undefined;
  let port: number | undefined;
  let host = DEFAULT_HOST;
  let session = sessionFromEnv(env);
  let safe = safeFromEnv(env);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '-h' || arg === '--help') return { kind: 'help' };
    if (arg === '-v' || arg === '--version') return { kind: 'version' };
    if (arg === '--session') {
      session = true;
      continue;
    }
    if (arg === '--safe') {
      safe = true;
      continue;
    }
    const [name, inline] = arg.startsWith('--') && arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    if (name !== '--port' && name !== '--host' && name !== '--openapi') throw new CliError(`Unknown option: ${arg}`);
    const value = inline ?? argv[++i];
    if (value === undefined || value === '' || (inline === undefined && value.startsWith('-'))) {
      throw new CliError(`${name} needs a value.`);
    }
    if (name === '--port') port = parsePort(value, '--port');
    else if (name === '--openapi') {
      if (openapi !== undefined) throw new CliError('--openapi was given twice.');
      openapi = value;
    } else host = value;
  }
  if (openapi !== undefined && argv.includes('--session')) {
    throw new CliError(
      '--session keeps writes to the built-in datasets; a mocked API answers writes without keeping them.',
    );
  }
  port ??= env.PORT ? parsePort(env.PORT, 'PORT') : DEFAULT_PORT;
  return { kind: 'serve', port, host, session, safe, ...(openapi === undefined ? {} : { openapi }) };
}

/** The address to print: a wildcard host is reachable as localhost. */
export function displayUrl(host: string, port: number): string {
  const name = host === '0.0.0.0' || host === '::' ? 'localhost' : host.includes(':') ? `[${host}]` : host;
  return `http://${name}:${port}`;
}

export const OFFLINE_FORMATS = ['ndjson', 'json', 'csv', 'sql'] as const;
export type OfflineFormat = (typeof OFFLINE_FORMATS)[number];

/** What `rest-in-pieces generate` was asked for. */
export interface GenerateOptions {
  /** A schema file; or `fields`, never both. */
  schema?: string;
  fields?: string;
  constraints: string[];
  component?: string;
  count: number;
  seed: number;
  format: OfflineFormat;
  table: string;
  batch: number;
  transaction: boolean;
  bom: boolean;
  locale: string;
  safe: boolean;
  baseUrl: string;
  /** A file to write; standard output when absent. */
  output?: string;
}

const VALUE_OPTIONS = new Set([
  '--schema',
  '--openapi',
  '--fields',
  '--constraints',
  '--component',
  '--count',
  '--seed',
  '--format',
  '--table',
  '--batch',
  '--locale',
  '--base-url',
  '--output',
]);
const FLAG_OPTIONS = new Set(['--transaction', '--bom', '--safe']);

function wholeNumber(name: string, text: string, min: number, max: number): number {
  const value = Number(text);
  if (!/^\d+$/.test(text) || value < min || value > max) {
    throw new CliError(
      `${name} must be a whole number from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`,
    );
  }
  return value;
}

/** Reads the arguments after `generate`. Throws `CliError` for anything it cannot use. */
export function parseGenerateArgs(argv: readonly string[]): CliCommand {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '-h' || arg === '--help') return { kind: 'help-generate' };
    const [name, inline] = arg.startsWith('--') && arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    if (name !== undefined && FLAG_OPTIONS.has(name) && inline === undefined) {
      flags.add(name);
      continue;
    }
    if (name === undefined || !VALUE_OPTIONS.has(name)) throw new CliError(`Unknown option: ${arg}`);
    const value = inline ?? argv[++i];
    if (value === undefined || value === '' || (inline === undefined && value.startsWith('-') && value.length > 1)) {
      throw new CliError(`${name} needs a value.`);
    }
    // `--openapi` is another name for `--schema`: the file says which it is.
    const key = name === '--openapi' ? '--schema' : name;
    if (values.has(key)) throw new CliError(`${name} was given twice.`);
    values.set(key, value);
  }
  const schema = values.get('--schema');
  const fields = values.get('--fields');
  if ((schema === undefined) === (fields === undefined)) {
    throw new CliError('Give one of --schema <file> or --fields <list>.');
  }
  if (fields === undefined && values.has('--constraints')) {
    throw new CliError('--constraints works with --fields; a schema states its own rules.');
  }
  if (schema === undefined && values.has('--component')) throw new CliError('--component works with --schema.');
  const format = values.get('--format') ?? 'ndjson';
  if (!(OFFLINE_FORMATS as readonly string[]).includes(format)) {
    throw new CliError(`--format must be one of ${OFFLINE_FORMATS.join(', ')}; got "${format}".`);
  }
  const table = values.get('--table') ?? 'records';
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(table)) {
    throw new CliError(
      `--table "${table}" is not a name sql can write: a letter or "_", then letters, digits or "_", up to 63.`,
    );
  }
  for (const option of ['--table', '--batch', '--transaction'] as const) {
    if (format !== 'sql' && (values.has(option) || flags.has(option)))
      throw new CliError(`${option} works with --format sql.`);
  }
  if (format !== 'csv' && flags.has('--bom')) throw new CliError('--bom works with --format csv.');
  const constraints = (values.get('--constraints') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return {
    kind: 'generate',
    ...(schema === undefined ? {} : { schema }),
    ...(fields === undefined ? {} : { fields }),
    constraints,
    ...(values.has('--component') ? { component: values.get('--component') as string } : {}),
    count: wholeNumber('--count', values.get('--count') ?? '1000', 1, MAX_OFFLINE_RECORDS),
    seed: wholeNumber('--seed', values.get('--seed') ?? '1', 0, MAX_SEED),
    format: format as OfflineFormat,
    table,
    batch: wholeNumber('--batch', values.get('--batch') ?? '1', 1, 1000),
    transaction: flags.has('--transaction'),
    bom: flags.has('--bom'),
    locale: values.get('--locale') ?? 'en-CA',
    safe: flags.has('--safe'),
    baseUrl: (values.get('--base-url') ?? 'http://localhost:6800').replace(/\/+$/, ''),
    ...(values.has('--output') ? { output: values.get('--output') as string } : {}),
  };
}
