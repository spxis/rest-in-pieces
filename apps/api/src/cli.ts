/** Argument parsing for the `rest-in-pieces` command, kept apart from the server so it can be tested alone. */

export const DEFAULT_PORT = 6800;
export const DEFAULT_HOST = 'localhost';

export const usage = `Usage: rest-in-pieces [options]

Starts the REST in Pieces API, with the playground and the API docs on the same address.

Options:
  --port <number>  Port to listen on (default: $PORT, then ${DEFAULT_PORT})
  --host <name>    Address to listen on (default: ${DEFAULT_HOST}; 0.0.0.0 for every interface)
  --session        Keep writes in memory until POST /reset (default: $REST_IN_PIECES_SESSION, then off)
  -v, --version    Print the version
  -h, --help       Print this help`;

export type CliCommand =
  | { kind: 'serve'; port: number; host: string; session: boolean }
  | { kind: 'help' }
  | { kind: 'version' };

/** The environment the command reads: `PORT`, and `REST_IN_PIECES_SESSION` to keep writes. */
export interface CliEnv {
  PORT?: string | undefined;
  REST_IN_PIECES_SESSION?: string | undefined;
}

/** Whether `REST_IN_PIECES_SESSION` turns the session on: any value but empty, `0`, `false`, `no` or `off`. */
export function sessionFromEnv(env: CliEnv): boolean {
  const value = env.REST_IN_PIECES_SESSION?.trim().toLowerCase();
  return value !== undefined && !['', '0', 'false', 'no', 'off'].includes(value);
}

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
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '-h' || arg === '--help') return { kind: 'help' };
    if (arg === '-v' || arg === '--version') return { kind: 'version' };
    if (arg === '--session') {
      session = true;
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
  return { kind: 'serve', port, host, session };
}

/** The address to print: a wildcard host is reachable as localhost. */
export function displayUrl(host: string, port: number): string {
  const name = host === '0.0.0.0' || host === '::' ? 'localhost' : host.includes(':') ? `[${host}]` : host;
  return `http://${name}:${port}`;
}
