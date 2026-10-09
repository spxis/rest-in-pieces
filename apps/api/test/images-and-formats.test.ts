import { describe, expect, it } from 'vitest';
import {
  AVATAR_COLOURS,
  avatarSvg,
  clampSide,
  escapeXml,
  hexColour,
  initialsOf,
  placeholderSvg,
  svgDataUrl,
} from '../src/images.ts';
import { negotiateFormat } from '../src/lib/format.ts';
import { SqlTableError, sqlIdentifier, sqlValue, toNdjson, toSql } from '../src/serialize.ts';
import { request } from './helpers.ts';

describe('/avatars/{seed}.svg', () => {
  it('draws initials from the name, in a colour from the seed, and caches for good', async () => {
    const { res, text } = await request('/avatars/ada.svg?name=Ada%20Lovelace');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('etag')).toBeTruthy();
    expect(text).toContain('>AL</text>');
    expect(text).toBe((await request('/avatars/ada.svg?name=Ada%20Lovelace')).text);
    expect(AVATAR_COLOURS.some((colour) => text.includes(`fill="${colour}"`))).toBe(true);
  });

  it('handles English, Japanese, Chinese, Korean and odd names', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL');
    expect(initialsOf('jean-luc picard')).toBe('JP');
    expect(initialsOf('Cher')).toBe('C');
    expect(initialsOf('  "Ada"  Byron King ')).toBe('AK');
    expect(initialsOf('Нонна Журавлева')).toBe('НЖ');
    expect(initialsOf('佐藤 美穂')).toBe('佐藤');
    expect(initialsOf('森 隆')).toBe('森');
    expect(initialsOf('長谷川 翔')).toBe('長谷');
    expect(initialsOf('王伟')).toBe('王');
    expect(initialsOf('김민준')).toBe('김');
    expect(initialsOf('')).toBe('');
  });

  it('draws a pattern without a name, and escapes what it is given', async () => {
    const pattern = avatarSvg('seed-1');
    expect(pattern).toContain('<g fill="#fff"');
    expect(pattern).not.toContain('<text');
    expect(pattern).toContain('aria-label="Avatar"');
    expect(avatarSvg('x', '<script>alert(1)</script> x')).not.toContain('<script>');
    expect(avatarSvg('a')).not.toBe(avatarSvg('b'));
    const japanese = await request(`/avatars/u1.svg?name=${encodeURIComponent('佐藤 美穂')}`);
    expect(japanese.text).toContain('>佐藤</text>');
    expect((await request('/avatars/%E4%BD%90.svg')).status).toBe(200);
    expect((await request('/avatars/a.png')).status).toBe(404);
  });
});

describe('/images/{w}x{h}.svg', () => {
  it('draws the size, or the text, clamped and escaped', async () => {
    const { res, text } = await request('/images/640x480.svg');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(text).toContain('width="640" height="480"');
    expect(text).toContain('>640×480</text>');
    const custom = await request(
      `/images/300x100.svg?text=${encodeURIComponent('<b>Hero & "co"</b>')}&bg=0f172a&fg=%23fff`,
    );
    expect(custom.text).toContain('&lt;b&gt;Hero &amp; &quot;co&quot;&lt;/b&gt;');
    expect(custom.text).toContain('fill="#0f172a"');
    expect(custom.text).toContain('fill="#fff"');
    expect((await request('/images/1x999999.svg')).text).toContain('width="8" height="4000"');
    expect((await request('/images/10x10.svg?bg=red&fg=javascript:x')).text).toContain('fill="#e2e8f0"');
    expect((await request('/images/wide.svg')).status).toBe(400);
    expect((await request('/images/640x480.png')).status).toBe(404);
  });

  it('has helpers the playground draws with', () => {
    expect(clampSide(Number.NaN)).toBe(8);
    expect(clampSide(5000)).toBe(4000);
    expect(hexColour(' ABC ', '#000')).toBe('#abc');
    expect(hexColour('12345', '#000')).toBe('#000');
    expect(hexColour(undefined, '#111')).toBe('#111');
    expect(escapeXml(`<'&">`)).toBe('&lt;&#39;&amp;&quot;&gt;');
    expect(placeholderSvg(100, 50, { text: 'あ'.repeat(200) })).toContain('あ'.repeat(120));
    expect(placeholderSvg(100, 50, { text: '   ' })).toContain('>100×50<');
    expect(svgDataUrl('<svg/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E');
  });

  it('is in the OpenAPI document under Images', async () => {
    const { body } = await request<{ paths: Record<string, Record<string, { tags: string[] }>> }>('/openapi.json');
    expect(body.paths['/avatars/{seed}.svg']?.get?.tags).toEqual(['Images']);
    expect(body.paths['/images/{width}x{height}.svg']?.get?.tags).toEqual(['Images']);
  });
});

describe('format=ndjson and format=sql', () => {
  it('write one line per record, and one INSERT per record into the dataset’s table', async () => {
    const json = (await request('/users?limit=3')).body.results;
    const ndjson = await request('/users?limit=3&format=ndjson');
    expect(ndjson.res.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8');
    expect(
      ndjson.text
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual(json);
    const sql = await request('/users?limit=3&format=sql');
    expect(sql.res.headers.get('content-type')).toBe('application/sql; charset=utf-8');
    const lines = sql.text.trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^INSERT INTO "users" \("id", "firstName", .*\) VALUES \(1, '/);
    expect(lines[0]).toMatch(/, (TRUE|FALSE), '\d{4}-/);
  });

  it('take Accept headers, table=, items, nested lists and /generate', async () => {
    const accepted = await request('/todos?limit=2', { headers: { Accept: 'application/x-ndjson' } });
    expect(accepted.res.headers.get('content-type')).toContain('ndjson');
    expect((await request('/todos?limit=2', { headers: { Accept: 'application/sql' } })).text).toMatch(
      /^INSERT INTO "todos"/,
    );
    expect((await request('/orders/1?format=sql&table=shop_orders')).text).toMatch(
      /^INSERT INTO "shop_orders" .*'\[\{"productId":/,
    );
    expect((await request('/users/2/todos?format=sql')).text).toMatch(/^INSERT INTO "todos"/);
    expect((await request('/generate?fields=n:person.firstName&limit=1&format=sql')).text).toMatch(
      /^INSERT INTO "generated" \("index", "n"\)/,
    );
    expect((await request('/countries/CA?format=ndjson')).text).toMatch(/^\{"alpha2":"CA"/);
    const messy = await request('/products?messy=1&limit=50&format=sql&seed=3');
    expect(messy.status).toBe(200);
  });

  it('refuse a table name SQL could not take, before any work', async () => {
    for (const table of ['1users', 'users;drop', 'a b', 'x'.repeat(64)]) {
      const { status, body } = await request<{ error: string }>(`/users?format=sql&table=${encodeURIComponent(table)}`);
      expect(status, table).toBe(400);
      expect(body.error).toContain('not a table name');
    }
    expect((await request('/users?format=json&table=1users')).status).toBe(200);
    expect((await request<{ error: string }>('/users?format=toml')).body.error).toBe(
      'Unsupported format "toml". Use json, csv, yaml, xml, ndjson or sql.',
    );
  });

  it('quote and escape every kind of value', () => {
    expect(sqlValue(null)).toBe('NULL');
    expect(sqlValue(undefined)).toBe('NULL');
    expect(sqlValue(true)).toBe('TRUE');
    expect(sqlValue(false)).toBe('FALSE');
    expect(sqlValue(1.5)).toBe('1.5');
    expect(sqlValue(Number.POSITIVE_INFINITY)).toBe('NULL');
    expect(sqlValue(10n)).toBe('10');
    expect(sqlValue("O'Brien")).toBe("'O''Brien'");
    expect(sqlValue('a\0b')).toBe("'ab'");
    expect(sqlValue(new Date('2026-01-01T00:00:00Z'))).toBe("'2026-01-01T00:00:00.000Z'");
    expect(sqlValue({ a: "it's" })).toBe(`'{"a":"it''s"}'`);
    expect(sqlIdentifier('we"ird')).toBe('"we""ird"');
    expect(toSql([{ a: 1 }, { b: 'x' }], 't')).toBe(
      'INSERT INTO "t" ("a", "b") VALUES (1, NULL);\nINSERT INTO "t" ("a", "b") VALUES (NULL, \'x\');\n',
    );
    expect(toSql([], 't')).toBe('');
    expect(toSql([5], 't')).toBe('INSERT INTO "t" ("value") VALUES (5);\n');
    expect(() => toSql([], 'bad name')).toThrow(SqlTableError);
    expect(toNdjson([{ a: 1 }, null])).toBe('{"a":1}\nnull\n');
    expect(negotiateFormat(undefined, 'application/ndjson')).toBe('ndjson');
    expect(negotiateFormat('SQL', undefined)).toBe('sql');
  });
});
