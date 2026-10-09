/** Argument parsing for the `rest-in-pieces` command, kept apart from the server so it can be tested alone. */

export const DEFAULT_PORT = 6800;
export const DEFAULT_HOST = 'localhost';

export const usage = `Usage: rest-in-pieces [options]

Starts the REST in Pieces API, with the playground and the API docs on the same address.

Options:
  --port <number>  Port to listen on (default: $PORT, then ${DEFAULT_PORT})
  --host <name>    Address to listen on (default: ${DEFAULT_HOST}; 0.0.0.0 for every interface)
  --session        Keep writes in memory until POST /reset (default: $REST_IN_PIECES_SESSION, then off)
  --safe           Serve safe values unless a request says safe=false: example-domain emails and URLs,
                   fiction-range phone numbers, test card numbers, documentation IPs, self-hosted
                   avatars (default: $REST_IN_PIECES_SAFE, then off; the default from 3.0)
  -v, --version    Print the version
  -h, --help       Print this help`;

export type CliCommand =
  | { kind: 'serve'; port: number; host: string; session: boolean; safe: boolean }
  | { kind: 'help' }
  | { kind: 'version' };

/**
 * The environment the command reads: `PORT`, `REST_IN_PIECES_SESSION` to keep writes, and `REST_IN_PIECES_SAFE`
 * for safe values.
 */
export interface CliEnv {
  PORT?: string | undefined;
  REST_IN_PIECES_SESSION?: string | undefined;
  REST_IN_PIECES_SAFE?: string | undefined;
}

/** A switch in the environment: on for any value but empty, `0`, `false`, `no` or `off`. */
const switchedOn = (raw: string | undefined) => {
  const value = raw?.trim().toLowerCase();
  return value !== undefined && !['', '0', 'false', 'no', 'off'].includes(value);
};

/** Whether `REST_IN_PIECES_SESSION` turns the session on: any value but empty, `0`, `false`, `no` or `off`. */
export const sessionFromEnv = (env: CliEnv): boolean => switchedOn(env.REST_IN_PIECES_SESSION);

/** Whether `REST_IN_PIECES_SAFE` turns safe values on, read the same way. */
export const safeFromEnv = (env: CliEnv): boolean => switchedOn(env.REST_IN_PIECES_SAFE);

/** A mistake in the command line, reported with the usage text rather than a stack trace. */
export class CliError extends Error {}

function parsePort(value: string, from: string): number {
  const port = Number(value);
  if (!/^\d+$/.test(value) || port > 65535) throw new CliError(`${from} must be a port number from 0 to 65535.`);
  return port;
}

export function parseCliArgs(argv: readonly string[], env: CliEnv = {}): CliCommand {
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
    if (name !== '--port' && name !== '--host') throw new CliError(`Unknown option: ${arg}`);
    const value = inline ?? argv[++i];
    if (value === undefined || value === '' || (inline === undefined && value.startsWith('-'))) {
      throw new CliError(`${name} needs a value.`);
    }
    if (name === '--port') port = parsePort(value, '--port');
    else host = value;
  }
  port ??= env.PORT ? parsePort(env.PORT, 'PORT') : DEFAULT_PORT;
  return { kind: 'serve', port, host, session, safe };
}

/** The address to print: a wildcard host is reachable as localhost. */
export function displayUrl(host: string, port: number): string {
  const name = host === '0.0.0.0' || host === '::' ? 'localhost' : host.includes(':') ? `[${host}]` : host;
  return `http://${name}:${port}`;
}
