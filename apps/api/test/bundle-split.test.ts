import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Part = { minified: number; gzip: number };
type Split = { measured: string; entries: Record<string, { eager: Part; later: Part; chunks: number }> };

const split = JSON.parse(readFileSync(new URL('../docs/bundle-size-split.json', import.meta.url), 'utf8')) as Split;
const whole = JSON.parse(readFileSync(new URL('../docs/bundle-size.json', import.meta.url), 'utf8')) as {
  entries: Record<string, Part>;
};
const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../../docs/size.md', import.meta.url), 'utf8');

describe('the size with code splitting', () => {
  it('measures every entry the one-file size does, and says what splitting leaves out of the first download', () => {
    expect(Object.keys(split.entries).sort()).toEqual(
      Object.keys(whole.entries)
        .filter((key) => key in split.entries)
        .sort(),
    );
    expect(Object.keys(split.entries)).toEqual(
      expect.arrayContaining(['.', './core', './browser', './msw', './vite', './element']),
    );
    expect(split.measured).toMatch(/with splitting/);
    for (const [key, one] of Object.entries(split.entries)) {
      expect(one.eager.gzip, key).toBeGreaterThan(0);
      // A chunk is gzipped on its own, so a one-chunk entry may differ from the one-file figure by a few bytes.
      expect(one.eager.gzip, key).toBeLessThanOrEqual((whole.entries[key]?.gzip ?? 0) * 1.02);
    }
  });

  it('shows /core as most of the weight eager and the data later, and the in-page entries as small shims', () => {
    const core = split.entries['./core'];
    expect(core?.later.gzip).toBeGreaterThan(300_000);
    expect(core?.eager.gzip).toBeLessThan(whole.entries['./core']?.gzip ?? 0);
    for (const key of ['./browser', './msw', './element'])
      expect(split.entries[key]?.eager.gzip, key).toBeLessThan(10_000);
  });

  it('is what the README and docs/size.md say', () => {
    const kb = (bytes: number | undefined) => Math.round((bytes ?? 0) / 1000);
    const core = split.entries['./core'];
    const main = split.entries['.'];
    expect(readme).toContain(
      `\`/core\` loads ${kb(core?.eager.gzip)} kB gzipped with the import and ${kb(core?.later.gzip)} kB of data on demand`,
    );
    expect(page).toContain(`${kb(core?.eager.gzip)} to ${kb(main?.eager.gzip)} kB`);
    expect(page).toContain(`${kb(core?.later.gzip)} kB of data`);
    expect(page).toContain(`${kb(split.entries['./mock']?.eager.gzip)} kB`);
  });
});
