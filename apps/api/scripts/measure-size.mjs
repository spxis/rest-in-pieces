// Measures each entry point of the package the way a bundler with code splitting would ship it, which is how a browser app
// loads it: `eager` is the entry's own chunk and every chunk it imports statically, `later` is what only a dynamic `import()`
// fetches: the app itself on the first request for `browser`, `msw`, `vite` and `element`, and for every entry the data it reads
// on demand (the Kuni subdivisions, the address data, the groupings...). docs/bundle-size.json, written by the family's
// docs-site.mjs, bundles without splitting, so it counts all of that as one file; this is the number a page pays up front.
//
//   node scripts/measure-size.mjs            measure and print
//   node scripts/measure-size.mjs --write    write docs/bundle-size-split.json
//   node scripts/measure-size.mjs --check    fail if docs/bundle-size-split.json is more than 2% off
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(root, 'docs', 'bundle-size-split.json');

/** The entry points that run code: the key, the source file and the platform docs/site.json gives it. */
function entriesOf() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const site = JSON.parse(readFileSync(join(root, 'docs', 'site.json'), 'utf8'));
  return Object.entries(pkg.exports)
    .map(([key, entry]) => [key, typeof entry === 'object' ? entry['rest-in-pieces:source'] : undefined])
    .filter(([, source]) => typeof source === 'string' && source.endsWith('.ts'))
    .map(([key, source]) => ({
      key,
      file: resolve(root, source),
      platform: site.entries?.[key]?.platform ?? 'neutral',
    }));
}

const gz = (bytes) => gzipSync(bytes, { level: 9 }).length;

/** { measured, entries: { ".": { eager: { minified, gzip }, later: { minified, gzip }, chunks } } }. */
export async function measureSplit() {
  const esbuild = await import('esbuild');
  const entries = {};
  for (const { key, file, platform } of entriesOf()) {
    const built = await esbuild.build({
      entryPoints: [file],
      bundle: true,
      splitting: true,
      minify: true,
      format: 'esm',
      platform,
      target: 'es2020',
      outdir: 'out',
      write: false,
      metafile: true,
      logLevel: 'silent',
      loader: { '.css': 'text', '.svg': 'text', '.txt': 'text' },
      mainFields: ['module', 'main'],
    });
    const outputs = built.metafile.outputs;
    // Every chunk a dynamic import() makes is an entry point to esbuild as well: the one that is ours is the one for our file.
    const entryOutput = Object.keys(outputs).find(
      (name) => outputs[name].entryPoint !== undefined && resolve(outputs[name].entryPoint) === file,
    );
    if (entryOutput === undefined) throw new Error(`No output for ${key}.`);
    // The chunks the entry reaches by `import … from`: loaded with it. A dynamic import() is not.
    const eager = new Set([entryOutput]);
    for (const name of eager) {
      for (const link of outputs[name].imports)
        if (link.kind === 'import-statement' && outputs[link.path]) eager.add(link.path);
    }
    const sizes = Object.fromEntries(built.outputFiles.map((one) => [relative(root, one.path), one.contents]));
    const total = { minified: 0, gzip: 0 };
    const first = { minified: 0, gzip: 0 };
    for (const [name, bytes] of Object.entries(sizes)) {
      const own = { minified: bytes.length, gzip: gz(bytes) };
      total.minified += own.minified;
      total.gzip += own.gzip;
      if ([...eager].some((one) => relative(root, resolve(root, one)) === name)) {
        first.minified += own.minified;
        first.gzip += own.gzip;
      }
    }
    entries[key] = {
      eager: first,
      later: { minified: total.minified - first.minified, gzip: total.gzip - first.gzip },
      chunks: Object.keys(sizes).length,
    };
  }
  return {
    measured: `esbuild ${esbuild.version}, bundled with splitting, minified, ES2020, each chunk gzipped at level 9 and summed`,
    entries,
  };
}

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const measured = await measureSplit();
  const mode = process.argv[2];
  for (const [key, one] of Object.entries(measured.entries)) {
    console.log(
      `${key.padEnd(18)} eager ${kb(one.eager.gzip).padStart(10)} gzipped (${kb(one.eager.minified)} minified), later ${kb(one.later.gzip).padStart(10)} gzipped, ${one.chunks} chunks`,
    );
  }
  if (mode === '--write') {
    writeFileSync(FILE, `${JSON.stringify(measured, null, 2)}\n`);
    console.log('wrote docs/bundle-size-split.json');
  } else if (mode === '--check') {
    if (!existsSync(FILE)) throw new Error('docs/bundle-size-split.json is missing: run `pnpm size:split --write`.');
    const recorded = JSON.parse(readFileSync(FILE, 'utf8'));
    for (const [key, one] of Object.entries(measured.entries)) {
      const was = recorded.entries[key]?.eager.gzip;
      if (was === undefined || Math.abs(one.eager.gzip - was) > Math.max(64, was * 0.02)) {
        throw new Error(
          `${key} is ${one.eager.gzip} bytes eager and gzipped; docs/bundle-size-split.json says ${was}. Run \`pnpm size:split --write\` and update the README.`,
        );
      }
    }
    console.log('docs/bundle-size-split.json is current');
  }
}
