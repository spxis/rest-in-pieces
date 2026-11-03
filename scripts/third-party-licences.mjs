import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The package an installed file belongs to: `{ dir, name }` for `…/node_modules/@scope/name/dist/x.js`, or null. */
export function packageOf(id) {
  const path = id.split('?')[0].replaceAll('\\', '/');
  const marker = '/node_modules/';
  const at = path.lastIndexOf(marker);
  if (at < 0) return null;
  const parts = path.slice(at + marker.length).split('/');
  const name = parts[0]?.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  if (!name) return null;
  return { name, dir: path.slice(0, at + marker.length) + name };
}

const LICENCE_FILE = /^(licen[cs]e|copying|unlicense)(\.|$|-)/i;
const NOTICE_FILE = /^notice(\.|$)/i;

/** The text of every file in `dir` whose name matches, longest-named last, so `LICENSE` comes before `LICENSE-MIT`. */
function textsOf(dir, pattern) {
  return readdirSync(dir)
    .filter((file) => pattern.test(file))
    .sort()
    .map((file) => readFileSync(join(dir, file), 'utf8').trim());
}

/** One package's section: its name, version, licence and repository, then each licence and notice file whole. */
function section(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const licence = typeof manifest.license === 'string' ? manifest.license : (manifest.license?.type ?? 'see below');
  const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
  const lines = [`## ${manifest.name} ${manifest.version}`, '', `Licence: ${licence}`];
  if (repository) lines.push(`Source: ${repository.replace(/^git\+/, '').replace(/\.git$/, '')}`);
  lines.push('');
  const files = [...textsOf(dir, LICENCE_FILE), ...textsOf(dir, NOTICE_FILE)];
  if (files.length === 0) {
    lines.push(`The package ships no licence file; its package.json declares ${licence}.`, '');
  }
  for (const text of files) lines.push('```text', text, '```', '');
  return { name: manifest.name, version: manifest.version, text: lines.join('\n') };
}

/**
 * A Vite/Rollup plugin that writes `fileName` beside the bundle: every installed package whose code (or whose font or
 * image) went into it, with its version, licence and the full text of its licence and notice files, because a bundle
 * is a copy of those packages and the licences ask that their notices travel with copies. The workspace's own code is
 * not listed. The list comes from the bundle itself, so it cannot drift from what shipped.
 */
export function thirdPartyLicences({ fileName = 'THIRD-PARTY-LICENSES.md', title = 'Third-party licences' } = {}) {
  return {
    name: 'third-party-licences',
    generateBundle(_options, bundle) {
      const dirs = new Map();
      for (const item of Object.values(bundle)) {
        const ids =
          item.type === 'chunk'
            ? Object.entries(item.modules ?? {})
                .filter(([, module]) => module.renderedLength > 0)
                .map(([id]) => id)
            : (item.originalFileNames ?? []);
        for (const id of ids) {
          const found = packageOf(id);
          if (found && existsSync(join(found.dir, 'package.json'))) dirs.set(found.dir, found.name);
        }
      }
      const sections = [...dirs.keys()].map(section).sort((a, b) => a.name.localeCompare(b.name));
      const text = [
        `# ${title}`,
        '',
        'The files in this folder contain code, data, fonts or images from the packages below, under their own licences.',
        'This list is written by the build from what went into the bundle. REST in Pieces itself is MIT (see LICENSE);',
        'the data credits are in NOTICE.md.',
        '',
        ...sections.map((one) => one.text),
      ].join('\n');
      this.emitFile({ type: 'asset', fileName, source: `${text.trimEnd()}\n` });
    },
  };
}
