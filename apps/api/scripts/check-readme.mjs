// Typecheck and run the README's SDK examples, preserving no-run browser recipes and explicit alias exceptions.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { parts, readInputs } from './readme-lint.mjs';

const root = process.cwd();
const blocks = parts(readInputs(root).readme).filter(
  (part) =>
    part.type === 'code' &&
    ['ts', 'js'].includes(part.info.split(/\s+/)[0]) &&
    !part.info.split(/\s+/).includes('no-check'),
);
const folder = join(root, '.readme-examples');
rmSync(folder, { recursive: true, force: true });
mkdirSync(folder, { recursive: true });
try {
  const files = blocks.map((block, index) => {
    const [lang, ...flags] = block.info.split(/\s+/);
    const file = join(folder, `example-${index}.${lang === 'ts' ? 'ts' : 'mjs'}`);
    writeFileSync(file, `${block.body}\nexport {};\n`);
    return { ...block, file, lang, flags };
  });
  const typed = files.filter((block) => block.lang === 'ts');
  writeFileSync(
    join(folder, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        lib: ['dom', 'dom.iterable', 'es2023'],
        module: 'esnext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      },
      include: typed.map((block) => block.file),
    }),
  );
  const checked = spawnSync(
    process.execPath,
    [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(folder, 'tsconfig.json')],
    { cwd: root, encoding: 'utf8' },
  );
  if (checked.status !== 0) throw new Error(`README examples do not typecheck:\n${checked.stdout}${checked.stderr}`);
  for (const block of files.filter((block) => !block.flags.includes('no-run'))) {
    await new Promise((done, fail) => {
      const child = spawn(process.execPath, [block.file], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      });
      let output = '';
      const timer = setTimeout(() => child.kill(), 30_000);
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      child.on('error', fail);
      child.on('close', (status) => {
        clearTimeout(timer);
        if (status !== 0) fail(new Error(`README line ${block.line} failed:\n${output}`));
        else done();
      });
    });
  }
  console.log(
    `${typed.length} README TypeScript examples typechecked; ${files.filter((block) => !block.flags.includes('no-run')).length} examples ran.`,
  );
} finally {
  rmSync(folder, { recursive: true, force: true });
}
