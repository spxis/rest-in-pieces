import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { test } from 'node:test';
import { packageOf, thirdPartyLicences } from './third-party-licences.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const api = JSON.parse(read('apps/api/package.json'));

test('packageOf names the package a bundled file came from, scoped or not, through pnpm links', () => {
  assert.deepEqual(packageOf('/r/node_modules/.pnpm/zod@4.6.5/node_modules/zod/v4/core/x.js'), {
    name: 'zod',
    dir: '/r/node_modules/.pnpm/zod@4.6.5/node_modules/zod',
  });
  assert.equal(
    packageOf('/r/node_modules/.pnpm/a/node_modules/@faker-js/faker/dist/x.js?v=1')?.name,
    '@faker-js/faker',
  );
  assert.equal(packageOf('/r/apps/api/src/core.ts'), null);
});

test('the licence file lists every package that went into a bundle, with its full licence text', () => {
  const emitted = [];
  const plugin = thirdPartyLicences();
  const hono = realpathSync(new URL('../apps/api/node_modules/hono', import.meta.url));
  const bundle = {
    'a.js': {
      type: 'chunk',
      modules: { [`${hono}/dist/hono.js`]: { renderedLength: 10 }, '/r/apps/api/src/core.ts': { renderedLength: 5 } },
    },
    'b.js': { type: 'chunk', modules: { [`${hono}/dist/unused.js`]: { renderedLength: 0 } } },
  };
  plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) }, {}, bundle);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].fileName, 'THIRD-PARTY-LICENSES.md');
  const text = emitted[0].source;
  assert.match(text, /^## hono \d/m);
  assert.match(text, /Licence: MIT/);
  assert.match(text, /Permission is hereby granted, free of charge/);
  assert.doesNotMatch(text, /^## @johnmorrisdotca\/rest-in-pieces/m);
});

test('NOTICE.md ships in the package and credits the data sources that ask for it', () => {
  assert.ok(api.files.includes('NOTICE.md'));
  const notice = read('NOTICE.md');
  for (const name of Object.keys(api.dependencies).filter((dep) => !dep.startsWith('@hono/node-server'))) {
    // Every dependency is either named, or one of a group the table names by its first member.
    const first = name.split('/').pop();
    assert.ok(notice.includes(name) || notice.includes(first), `NOTICE.md does not name ${name}`);
  }
  for (const credit of [
    'GeoNames',
    'CC BY 4.0',
    'Australian Bureau of Statistics',
    'Ordnance Survey',
    'Royal Mail data © Royal Mail copyright and database right 2026',
    'Open Government Licence v3.0',
    'Licence Ouverte',
    'Unicode-3.0',
    'Geolonia',
  ]) {
    assert.ok(notice.includes(credit), `NOTICE.md does not credit ${credit}`);
  }
});
