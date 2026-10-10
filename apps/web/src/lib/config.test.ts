import { describe, expect, it } from 'vitest';
import { configFromHash, configToHash, defaultConfig, normalizeDelay, SAMPLE_SCHEMA } from './config.ts';

const base = defaultConfig('http://localhost:6800');

describe('the sample schema', () => {
  it('is valid JSON, and its pattern keeps its backslash', () => {
    const parsed = JSON.parse(SAMPLE_SCHEMA) as { properties: { sku: { pattern: string } } };
    expect(parsed.properties.sku.pattern).toBe('^[A-Z]{3}-\\d{4}$');
  });
});

describe('shared setups', () => {
  it('round-trips a setup through the URL hash', () => {
    const config = {
      ...base,
      endpoint: 'generate',
      offset: 20,
      paging: 'cursor' as const,
      seed: 42,
      q: 'ont',
      filters: [{ id: 1, field: 'age', operator: 'gte' as const, value: '30' }],
      status: 503,
      delay: '200-800',
      trickle: 250,
      fields: [{ id: 3, name: 'price', type: 'commerce.price' }],
      constraints: 'end>start,total>=subtotal',
      schemaMode: true,
      schema: '{"type":"object"}',
      component: 'Pet',
      locale: 'global',
      messy: 0.5,
    };
    expect(configFromHash(configToHash(config, base), base)).toEqual(config);
    expect(configFromHash(`#constraints=${'a>b,'.repeat(200)}`, base).constraints).toBe('');
  });

  it('round-trips a write: method, record, body and conflict', () => {
    const config = {
      ...base,
      endpoint: 'users',
      method: 'PATCH' as const,
      recordId: '42',
      body: '{\n  "city": "Halifax & Dartmouth"\n}',
      conflict: true,
    };
    expect(configFromHash(configToHash(config, base), base)).toEqual(config);
    const odd = configFromHash(`#method=TRACE&recordId=${encodeURIComponent('../1')}&body=${'x'.repeat(70_000)}`, base);
    expect(odd).toEqual(base);
  });

  it('leaves defaults out of the hash', () => {
    expect(configToHash(base, base)).toBe('endpoint=names');
  });

  it('ignores values that do not validate', () => {
    const config = configFromHash(
      '#limit=5000&offset=-1&paging=keyset&seed=abc&locale=fr_ca!&format=pdf&endpoint=../x&fields=[{"bad":true}]&filters=nope' +
        '&delay=800-200&trickle=20000&messy=2',
      base,
    );
    expect(config).toEqual(base);
  });

  it('reads delays and ranges only when they validate', () => {
    expect(configFromHash('#delay=1500', base).delay).toBe('1500');
    expect(configFromHash('#delay=200-800', base).delay).toBe('200-800');
    for (const delay of ['5000-20000', '200-', '-5', '1.5', '1-2-3', '<b>']) {
      expect(configFromHash(`#delay=${encodeURIComponent(delay)}`, base).delay, delay).toBe('');
    }
    expect(normalizeDelay('0-0')).toBe('');
    expect(normalizeDelay('0-500')).toBe('0-500');
    expect(normalizeDelay('10000')).toBe('10000');
    expect(normalizeDelay('10001')).toBeNull();
  });

  it('reads links shared by the previous playground', () => {
    const config = configFromHash('#endpoint=names&fail=true&status=503&metadata=false', base);
    expect(config).toMatchObject({ status: 503, failRate: 1, metadata: false });
  });
});
