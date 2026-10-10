import { serve } from '@hono/node-server';
import pkg from '../package.json' with { type: 'json' };
import { createNodeApp } from './app.ts';
import { CliError, displayUrl, generateUsage, parseCliArgs, usage } from './cli.ts';
import { runGenerateCommand } from './offline.ts';

async function main(): Promise<void> {
  let command: ReturnType<typeof parseCliArgs>;
  try {
    command = parseCliArgs(process.argv.slice(2), process.env);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    console.error(`${error.message}\n\n${process.argv[2] === 'generate' ? generateUsage : usage}`);
    process.exitCode = 2;
    return;
  }
  if (command.kind === 'generate') {
    process.exitCode = await runGenerateCommand(command, {
      stdout: process.stdout,
      stderr: (text) => process.stderr.write(text),
    });
    return;
  }
  if (command.kind !== 'serve') {
    console.log(command.kind === 'help' ? usage : command.kind === 'help-generate' ? generateUsage : pkg.version);
    return;
  }

  const { host, port, session, safe } = command;
  const app = createNodeApp({ session, safe });
  const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    const url = displayUrl(host, info.port);
    const kept = session ? '\nSession: on. Writes are kept in memory until POST /reset.' : '';
    const safely = safe ? '\nSafe values: on. Requests may still ask for safe=false.' : '';
    console.log(`REST in Pieces ${pkg.version} is running at ${url}\nAPI docs: ${url}/docs${kept}${safely}`);
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

await main();
