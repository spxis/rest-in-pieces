import { describe, expect, it } from 'vitest';
import { casesPageHref, playgroundHref, viewFor } from './route.ts';

describe('which page an address asks for', () => {
  it('opens the use cases from a folder or from a query', () => {
    expect(viewFor('/rest-in-pieces/use-cases/', '')).toBe('use-cases');
    expect(viewFor('/rest-in-pieces/use-cases', '')).toBe('use-cases');
    expect(viewFor('/', '?view=use-cases')).toBe('use-cases');
    expect(viewFor('/', '?lang=ja&view=use-cases')).toBe('use-cases');
  });

  it('draws the playground for everything else', () => {
    expect(viewFor('/', '')).toBe('playground');
    expect(viewFor('/rest-in-pieces/', '')).toBe('playground');
    expect(viewFor('/', '?view=other')).toBe('playground');
    expect(viewFor('/use-cases/extra', '')).toBe('playground');
  });

  it('writes the address each build can answer', () => {
    expect(casesPageHref(true, '/rest-in-pieces/')).toBe('/rest-in-pieces/use-cases/');
    expect(casesPageHref(false, '/')).toBe('/?view=use-cases');
    expect(viewFor(casesPageHref(true, '/rest-in-pieces/'), '')).toBe('use-cases');
    expect(playgroundHref('/rest-in-pieces/')).toBe('/rest-in-pieces/');
  });
});
