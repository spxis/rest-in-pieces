import { describe, expect, it } from 'vitest';
import { docsUrl, fixturesUrl, PAGES_URL, staticApiUrl } from './links.ts';

describe('links in the top bar', () => {
  it('sends the API reference to the server, or to the static copy on Pages', () => {
    expect(docsUrl('http://localhost:6800/', false, '/')).toBe('http://localhost:6800/docs');
    expect(docsUrl('https://example.test/api', false, '/')).toBe('https://example.test/api/docs');
    expect(docsUrl('https://spxis.github.io/rest-in-pieces/api', true, '/rest-in-pieces/')).toBe(
      '/rest-in-pieces/api/docs/',
    );
  });

  it('finds the fixtures beside the Pages build, and on the live site from anywhere else', () => {
    expect(fixturesUrl(true, '/rest-in-pieces/')).toBe('/rest-in-pieces/fixtures/index.json');
    expect(fixturesUrl(false, '/')).toBe(`${PAGES_URL}fixtures/index.json`);
  });

  it('finds the static API beside the Pages build, and on the live site from anywhere else', () => {
    expect(staticApiUrl(true, '/rest-in-pieces/')).toBe('/rest-in-pieces/api/index.json');
    expect(staticApiUrl(false, '/')).toBe(`${PAGES_URL}api/index.json`);
  });
});
