import * as kuni from '@johnmorrisdotca/kuni';
import { describe, expect, it } from 'vitest';
import { IOC_CODES, WITHDRAWN } from '../src/data/kuniLocal.ts';

/**
 * Kuni 1.2.0, the version on npm, has neither Olympic codes nor the withdrawn countries; `src/data/kuniLocal.ts` carries
 * them, made from Kuni's own build. The day the installed Kuni has them, they must be the same, and this file goes.
 */
describe('the Olympic codes and withdrawn countries carried until Kuni 1.3.0', () => {
  it("are Kuni's own when the installed Kuni has them, and are what stands in for them while it does not", async () => {
    const installed = kuni.country('JP') as { ioc?: string } | null;
    if (installed?.ioc === undefined) {
      // Not released yet: the table holds 209 codes and 31 withdrawn countries, each in place.
      expect(Object.keys(IOC_CODES)).toHaveLength(209);
      expect(WITHDRAWN).toHaveLength(31);
      return;
    }
    for (const country of kuni.countries() as unknown as { alpha2: string; ioc?: string }[])
      expect(IOC_CODES[country.alpha2], country.alpha2).toBe(country.ioc);
    const entry = '@johnmorrisdotca/kuni/withdrawn';
    const { withdrawnCountries } = (await import(/* @vite-ignore */ entry)) as { withdrawnCountries(): unknown[] };
    expect(JSON.parse(JSON.stringify(withdrawnCountries()))).toEqual(JSON.parse(JSON.stringify(WITHDRAWN)));
  });

  it('have a withdrawn country for every code the old country list marked deleted', () => {
    const codes = new Set(WITHDRAWN.map((one) => one.alpha2));
    for (const code of [
      'AI',
      'AN',
      'BQ',
      'BU',
      'BY',
      'CS',
      'CT',
      'DD',
      'DY',
      'FQ',
      'GE',
      'HV',
      'JT',
      'MI',
      'NH',
      'NQ',
      'NT',
      'PC',
      'PU',
      'PZ',
      'RH',
      'SK',
      'TP',
      'VD',
      'WK',
      'YD',
      'YU',
      'ZR',
    ]) {
      expect(codes.has(code), code).toBe(true);
    }
  });
});
