import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/core.ts';

/**
 * A sample of what 2.13.0 served, as hashes of the records (never the metadata, which carries the time and the
 * version). New datasets, relations and safe values must leave every one of these unchanged: the same seed and URL
 * give the same records they always did. A change here is a breaking change and needs a major version.
 *
 * `/countries` is not here since it was made from Kuni: its old fields keep their names and types and are held by
 * `countries.test.ts`, which compares them with the old data set for every code.
 */
const PINNED: ReadonlyArray<[string, string]> = [
  ['/users?limit=1000', '33b668178386c776'],
  ['/users?limit=1000&seed=7&locale=ja', 'c9ad9e9ed8da1f17'],
  ['/users?limit=1000&locale=global', 'c9c61e99616083e7'],
  ['/users?limit=1000&locale=de', '14427c87981990b1'],
  ['/products?limit=1000', 'e778d731d4f7f908'],
  ['/products?limit=1000&locale=ja', 'b01dfdb5fa28a923'],
  ['/products?limit=1000&locale=global&seed=3', 'b2ce5b0fd0f7c71c'],
  ['/companies?limit=1000', '084f4678a9899480'],
  ['/companies?limit=1000&locale=ko', '0f003c6b59b7ec9f'],
  ['/names?limit=1000', 'c46b1adb95fa381c'],
  ['/names?limit=1000&locale=en-US&seed=9', 'ab8427b42c09bc24'],
  ['/users/42?seed=5', '2b4d4d2dd04058e0'],
  ['/users?messy=true&limit=200&seed=2', 'ea43c3932785ddc2'],
  [
    '/generate?fields=name:person.fullName,email:internet.email,ip:internet.ip,card:finance.creditCardNumber&limit=100&seed=4',
    '6ac1c6066c4d26e8',
  ],
  ['/users?format=csv&limit=50', '46e5eda502381628'],
  ['/products?format=xml&limit=20', '770723796edbd1b7'],
  ['/names?format=yaml&limit=20', 'e3f0626d11a4afa4'],
];

/** The records of a response, as text: the page of a JSON envelope, or a text format with its metadata cut out. */
async function recordsOf(res: Response): Promise<string> {
  const text = await res.text();
  if (!(res.headers.get('content-type') ?? '').includes('json')) {
    return text.replace(/<metadata>[\s\S]*?<\/metadata>/, '').replace(/^metadata:[\s\S]*?^results:/m, 'results:');
  }
  const body = JSON.parse(text);
  return JSON.stringify(Array.isArray(body) ? body : 'metadata' in body ? body.results : body);
}

const digest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

describe('2.13.0 output', () => {
  it.each(PINNED)('%s is unchanged', async (url, hash) => {
    expect(digest(await recordsOf(await createApp().request(url)))).toBe(hash);
  });
});
