import { describe, expect, it } from 'vitest';
import { configFromHash, configToHash, defaultConfig } from './config.ts';

const base = defaultConfig('http://localhost:8080');

describe('shared setups', () => {
  it('round-trips a setup through the URL hash', () => {
    const config = {
      ...base,
      endpoint: 'generate',
      offset: 20,
      seed: 42,
      q: 'ont',
      filters: [{ id: 1, field: 'age', operator: 'gte' as const, value: '30' }],
      status: 503,
      fields: [{ id: 3, name: 'price', type: 'commerce.price' }],
    };
    expect(configFromHash(configToHash(config, base), base)).toEqual(config);
  });

  it('leaves defaults out of the hash', () => {
    expect(configToHash(base, base)).toBe('endpoint=names');
  });

  it('ignores values that do not validate', () => {
    const config = configFromHash(
      '#limit=5000&offset=-1&seed=abc&format=pdf&endpoint=../x&fields=[{"bad":true}]&filters=nope',
      base,
    );
    expect(config).toEqual(base);
  });

  it('reads links shared by the previous playground', () => {
    const config = configFromHash('#endpoint=names&fail=true&status=503&metadata=false', base);
    expect(config).toMatchObject({ status: 503, failRate: 1, metadata: false });
  });
});
