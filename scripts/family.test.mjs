import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { familyBlockOf, familyReadmeBlock } from './family-readme.mjs';
import { FAMILY, FAMILY_GROUPS, FAMILY_TEMPLATE_VERSION, familyFooter } from './family-template.mjs';

const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
describe('the shared family list', () => {
  it('pins the shared template and README writer', () => {
    assert.equal(FAMILY_TEMPLATE_VERSION, '2026-10-09-embed-builder-words');
    assert.equal(
      sha('scripts/family-template.mjs'),
      '3d90724c7ed364c994d03549b7562dd98b7841d7827b492dc7ddcdc4604192ff',
    );
    assert.equal(sha('scripts/family-readme.mjs'), 'f0bb3adff1a917f672c1b6a323e7ee068bd8b43294cdfb55f31c90112971bcf1');
  });
  it('lists every member once, grouped and alphabetical', () => {
    assert.equal(FAMILY.length, 28);
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
