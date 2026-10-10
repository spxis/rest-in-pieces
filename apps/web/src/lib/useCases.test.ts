import { describe, expect, it } from 'vitest';
import { PHRASES } from '../i18n/phrases.ts';
import { configFromHash, configToHash, defaultConfig } from './config.ts';
import { DISPLAY_BASE, LOCALES, PRODUCT_SCHEMA, R, USE_CASES } from './useCases.ts';

const EXPECTED = [
  'front-end',
  'tutorial-api',
  'unhappy-paths',
  'messy-data',
  'sign-in',
  'repeatable',
  'seed-database',
  'from-schema',
  'international',
  'healthcare-fintech',
];

const everySnippet = USE_CASES.flatMap((useCase) => useCase.snippets.map((snippet) => snippet.code)).join('\n');

/** Every request an illustration sends, with the paths a reader's snippets must show for it. */
const requests = Object.values(R).flatMap((request) =>
  typeof request === 'function' ? LOCALES.map((locale) => request(locale)) : [request],
);

describe('the ten use cases', () => {
  it('are these ten, in this order, each with copyable code', () => {
    expect(USE_CASES.map((useCase) => useCase.id)).toEqual(EXPECTED);
    for (const useCase of USE_CASES) {
      expect(useCase.snippets.length, useCase.id).toBeGreaterThan(0);
      for (const snippet of useCase.snippets) expect(snippet.code.trim(), useCase.id).not.toBe('');
    }
  });

  it('say their words in every phrase they name', () => {
    for (const useCase of USE_CASES) {
      for (const key of [useCase.title, useCase.problem, useCase.how]) expect(PHRASES[key], key).toBeTruthy();
      expect(useCase.title, useCase.id).toBe(`uc.${useCase.id}.title`);
    }
  });

  it('show the paths the animations send, so what plays is what is copied', () => {
    for (const request of requests) {
      expect(request.path.startsWith('/'), request.path).toBe(true);
      // The JSONPlaceholder tutorial's snippets set the base to /jsonplaceholder, so they name what follows it.
      const shown =
        everySnippet.includes(request.path) || everySnippet.includes(request.path.replace('/jsonplaceholder', ''));
      expect(shown, request.path).toBe(true);
    }
    expect(everySnippet).toContain(DISPLAY_BASE);
  });

  it('show the body that is sent, not a lookalike', () => {
    expect(everySnippet).toContain(JSON.stringify(R.newPost.body));
    expect(everySnippet).toContain(JSON.stringify(R.login.body));
    expect(everySnippet).toContain(JSON.stringify(R.generate.body));
    expect(Object.keys(PRODUCT_SCHEMA.properties)).toEqual(['sku', 'status', 'price', 'contact']);
  });

  it('keep every query to what the API takes', () => {
    for (const request of requests) {
      const query = new URL(request.path, DISPLAY_BASE).searchParams;
      const limit = query.get('limit');
      if (limit !== null) expect(Number(limit), request.path).toBeLessThanOrEqual(10);
    }
  });

  it('open the playground with the setup they describe', () => {
    for (const useCase of USE_CASES) {
      if (!useCase.playground) continue;
      const config = { ...defaultConfig(DISPLAY_BASE), ...useCase.playground };
      const read = configFromHash(`#${configToHash(config, defaultConfig(DISPLAY_BASE))}`, defaultConfig(DISPLAY_BASE));
      expect(read.endpoint, useCase.id).toBe(config.endpoint);
      expect(read.seed, useCase.id).toBe(config.seed);
      expect(read.limit, useCase.id).toBe(config.limit);
    }
  });
});
