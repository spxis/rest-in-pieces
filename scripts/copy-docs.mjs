// The shared docs build belongs to the SDK; Pages keeps its existing playground artifact directory.
import { cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(repository, 'apps/api/site');
const to = resolve(repository, 'apps/web/dist-pages');
for (const file of ['docs', 'api.html', 'llms.txt', 'llms-full.txt']) {
  if (!existsSync(resolve(from, file))) throw new Error(`Build SDK documentation first: ${file} is missing`);
  cpSync(resolve(from, file), resolve(to, file), { recursive: true });
}
