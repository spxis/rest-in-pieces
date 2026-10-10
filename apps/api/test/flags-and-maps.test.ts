import { FLAG_CODES, VERSION } from '@johnmorrisdotca/hata';
import { describe, expect, it } from 'vitest';
import { flagsFromEnv } from '../src/cli.ts';
import { createApp } from '../src/core.ts';
import { HATA_VERSION, FLAG_CODES as LOCAL_CODES } from '../src/data/flagCodes.ts';
import { flagCodeOf, flagUrlOf } from '../src/data/flags.ts';
import { type Envelope, request } from './helpers.ts';

const cdn = createApp({ flags: 'cdn' });
const get = (path: string, app = createApp()) => app.request(path);

describe('the list of flags a record can name', () => {
  it("is the installed Hata's own list, so a Hata release that changes it fails here and is regenerated", () => {
    expect(HATA_VERSION).toBe(VERSION);
    expect([...LOCAL_CODES]).toEqual([...FLAG_CODES]);
    expect(LOCAL_CODES).toHaveLength(464);
  });

  it('writes a code as Hata does, and finds the CDN address of a flag it has', () => {
    expect(flagCodeOf(' jp-13 ')).toBe('JP-13');
    expect(flagCodeOf('ca_on')).toBe('CA-ON');
    expect(flagCodeOf('XX')).toBeNull();
    expect(flagCodeOf('EH')).toBeNull();
    expect(flagUrlOf('JP')).toBe('https://cdn.jsdelivr.net/npm/@johnmorrisdotca/hata@1/dist/svg/jp.svg');
    expect(flagUrlOf('de-BY')).toBe('https://cdn.jsdelivr.net/npm/@johnmorrisdotca/hata@1/dist/svg/de-by.svg');
    expect(flagUrlOf('nowhere')).toBeNull();
  });

  it('reads REST_IN_PIECES_FLAGS', () => {
    expect(flagsFromEnv({})).toBe('auto');
    expect(flagsFromEnv({ REST_IN_PIECES_FLAGS: ' CDN ' })).toBe('cdn');
    expect(flagsFromEnv({ REST_IN_PIECES_FLAGS: 'local' })).toBe('auto');
  });
});

describe("a record's flag", () => {
  it('is the CDN address of its SVG on a country and a subdivision, and null where Hata has none', async () => {
    const jp = (await request<{ flag: string; emoji: string }>('/countries/JP')).body;
    expect(jp.flag).toBe('https://cdn.jsdelivr.net/npm/@johnmorrisdotca/hata@1/dist/svg/jp.svg');
    expect(jp.emoji).toBe('🇯🇵');
    expect((await request<{ flag: string | null }>('/countries/EH')).body.flag).toBeNull();
    expect((await request<{ flag: string }>('/subdivisions/JP-13')).body.flag).toMatch(/\/jp-13\.svg$/);
    expect((await request<{ flag: string | null }>('/subdivisions/FR-69')).body.flag).toBeNull();
    const countries = (await request<{ flag: string | null }[]>('/countries?limit=1000')).body;
    expect(countries.filter((one) => one.flag !== null).length).toBeGreaterThan(240);
    const regions = (await request<Envelope<{ flag: string | null }>>('/subdivisions?country=JP&limit=100')).body
      .results;
    expect(regions.filter((one) => one.flag === null).map((one) => (one as unknown as { code: string }).code)).toEqual([
      'JP-34',
      'JP-37',
    ]); // Hata has no flag for Hiroshima and Kagawa (its leftOut list)
  });
});

describe('GET /flags/{code}.svg', () => {
  it('draws the flag with Hata when it is installed, standalone and cacheable', async () => {
    const res = await get('/flags/jp.svg');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await res.text()).toMatch(/^<svg /);
    expect((await get('/flags/JP-13.svg')).status).toBe(200);
    expect((await get('/flags/ca_on.svg')).status).toBe(200);
  });

  it('frames it as asked: a square, a round flag, a crop, a variant', async () => {
    const own = await (await get('/flags/jp.svg')).text();
    const round = await (await get('/flags/jp.svg?shape=round')).text();
    expect(round).toContain('clipPath');
    expect(round).not.toBe(own);
    expect(await (await get('/flags/ca.svg?shape=1:1&fit=whole')).text()).toMatch(/^<svg /);
    expect((await get('/flags/us.svg?shape=1:1&fit=crop')).status).toBe(200);
    expect((await get('/flags/de.svg?variant=nothing-like-this')).status).toBe(404);
  });

  it('answers 404 for a code with no flag, and 400 for a shape or fit it does not know', async () => {
    const none = await get('/flags/xx.svg');
    expect(none.status).toBe(404);
    expect(((await none.json()) as { error: string }).error).toContain('no flag');
    expect((await get('/flags/jp.svg?shape=hexagon')).status).toBe(400);
    expect((await get('/flags/jp.svg?fit=squash')).status).toBe(400);
  });

  it('redirects to the CDN, fetching nothing, when asked not to draw (and when Hata is not installed)', async () => {
    const res = await get('/flags/jp-13.svg', cdn);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://cdn.jsdelivr.net/npm/@johnmorrisdotca/hata@1/dist/svg/jp-13.svg');
    // A frame, a fit or a variant is Hata's to draw: without it the answer says so.
    const framed = await get('/flags/jp.svg?shape=round', cdn);
    expect(framed.status).toBe(501);
    expect(((await framed.json()) as { error: string }).error).toContain('npm install @johnmorrisdotca/hata');
    expect((await get('/flags/jp.svg?shape=own', cdn)).status).toBe(302);
    expect((await get('/flags/xx.svg', cdn)).status).toBe(404);
  });
});

describe('GET /maps/{code}.svg', () => {
  it("draws a country's outline, by alpha-2, alpha-3 or numeric code", async () => {
    for (const code of ['JP', 'jp', 'JPN', '392']) {
      const res = await get(`/maps/${code}.svg`);
      expect(res.status, code).toBe(200);
      expect(res.headers.get('content-type')).toContain('image/svg+xml');
      const svg = await res.text();
      expect(svg).toMatch(/^<svg /);
      expect(svg).toContain('data-map="country-jp"');
    }
  });

  it('lights a subdivision on its country, in a colour of your own, and labels it in Japanese', async () => {
    const plain = await (await get('/maps/JP-13.svg')).text();
    expect(plain).toContain('data-map="divisions-jp"');
    const coloured = await (await get('/maps/jp-13.svg?color=2f6b4f&lang=ja')).text();
    expect(coloured).toContain('#2f6b4f');
    expect(coloured).toContain('日本');
    expect((await get('/maps/CA-ON.svg')).status).toBe(200);
    expect((await get('/maps/DE-BY.svg')).status).toBe(200);
  });

  it('puts a dot on the capital of a country, in a colour of your own', async () => {
    const without = await (await get('/maps/JP.svg')).text();
    expect(without).not.toContain('<circle class="cz-capital"');
    const dotted = await (await get('/maps/JP.svg?capital=true&dot=00aa44')).text();
    expect(dotted).toContain('<circle class="cz-capital"');
    expect(dotted).toContain('fill="#00aa44"');
    // A region's projection is its own, so it has no capital to place.
    expect(await (await get('/maps/JP-13.svg?capital=true')).text()).not.toContain('<circle class="cz-capital"');
  });

  it('is 404 for a country or region Chizu has no map of, and 400 for a colour or language it cannot read', async () => {
    const none = await get('/maps/SM.svg');
    expect([200, 404]).toContain(none.status);
    expect((await get('/maps/XX.svg')).status).toBe(404);
    expect((await get('/maps/JP-99.svg')).status).toBe(404);
    expect((await get('/maps/AD-02.svg')).status).toBe(404);
    expect((await get('/maps/JP.svg?color=red')).status).toBe(400);
    expect((await get('/maps/JP.svg?dot=zz')).status).toBe(400);
    expect((await get('/maps/JP.svg?lang=fr')).status).toBe(400);
  });

  it('is in the OpenAPI document, with the flags', async () => {
    const spec = (await request<{ paths: Record<string, unknown> }>('/openapi.json')).body;
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/flags/{code}.svg', '/maps/{code}.svg']));
  });
});
