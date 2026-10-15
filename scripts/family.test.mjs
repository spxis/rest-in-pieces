import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { familyBlockOf, familyReadmeBlock } from './family-readme.mjs';
import { FAMILY, FAMILY_GROUPS, FAMILY_TEMPLATE_VERSION, familyFooter } from './family-template.mjs';

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
describe('the shared family list', () => {
  it('pins the shared template and README writer', () => {
    assert.equal(FAMILY_TEMPLATE_VERSION, '2026-10-15d');
    assert.equal(
      sha('scripts/family-template.mjs'),
      'fcc192026cf284303344e108b20e6181126607c670a881a6b3bf8479da26ab03',
    );
    assert.equal(sha('scripts/family-readme.mjs'), '0ca8badd4d54e393f723b5a625e76caf4b96a01bb79d087448748a358e834afc');
  });
  it('lists every member once, grouped and alphabetical', () => {
    assert.equal(FAMILY.length, 32);
    assert.deepEqual(
      FAMILY_GROUPS.flatMap((group) => group.members),
      FAMILY.map((one) => one.id),
    );
    assert.equal(new Set(FAMILY.map((one) => one.id)).size, FAMILY.length);
    for (const group of FAMILY_GROUPS) assert.deepEqual(group.members, [...group.members].sort());
    assert.ok(familyFooter({ id: 'rest-in-pieces' }).includes('href="https://spxis.github.io/rest-in-pieces/"'));
    assert.equal(familyFooter({ id: 'rest-in-pieces' }).match(/aria-current="page"/g).length, 1);
  });
  it('keeps the README list generated from the shared template', () => {
    assert.equal(familyBlockOf(readFileSync('README.md', 'utf8')), familyReadmeBlock('rest-in-pieces'));
  });
});

// The shared stylesheet is copied byte-identically, like the family template.
const familyCss = readFileSync('apps/web/public/family.css', 'utf8');
const body = familyCss.slice(familyCss.indexOf('\n') + 1);
assert.equal(
  createHash('sha256').update(body).digest('hex'),
  'c1e392564a7fd94d0bb5cfaefb6d4fedfd147fc3e27f3a7afd8d8dac8c94a227',
);
