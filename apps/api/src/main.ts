import { serve } from '@hono/node-server';
import pkg from '../package.json' with { type: 'json' };
import { createNodeApp } from './app.ts';
import { CliError, displayUrl, parseCliArgs, usage } from './cli.ts';

function main(): void {
  let command: ReturnType<typeof parseCliArgs>;
  try {
    command = parseCliArgs(process.argv.slice(2), process.env);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    console.error(`${error.message}\n\n${usage}`);
    process.exitCode = 2;
    return;
  }
  if (command.kind !== 'serve') {
    console.log(command.kind === 'help' ? usage : pkg.version);
    return;
  }

  const { host, port, session } = command;
  const app = createNodeApp({ session });
  const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    const url = displayUrl(host, info.port);
    const kept = session ? '\nSession: on. Writes are kept in memory until POST /reset.' : '';
    console.log(`REST in Pieces ${pkg.version} is running at ${url}\nAPI docs: ${url}/docs${kept}`);
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Try --port with another number.` : error.message,
    );
    process.exit(1);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}

main();
