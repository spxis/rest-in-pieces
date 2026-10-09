import { describe, expect, it } from 'vitest';
import { columnsOf, downloadOf, fileStem, toCsv, toText } from './download.ts';

const rows = [
  { index: 0, name: 'Aaliyah Corkery', note: 'says "hi", twice' },
  { index: 1, name: '佐藤 美穂', tags: ['a', 'b'], note: null },
];

describe('downloads', () => {
  it('takes every column any row has, in order', () => {
    expect(columnsOf(rows)).toEqual(['index', 'name', 'note', 'tags']);
  });

  it('writes RFC 4180 CSV: quoted where needed, nested values as JSON, null as nothing', () => {
    expect(toCsv(rows)).toBe(
      'index,name,note,tags\r\n0,Aaliyah Corkery,"says ""hi"", twice",\r\n1,佐藤 美穂,,"[""a"",""b""]"\r\n',
    );
    expect(toCsv([{ a: ' padded ', b: 'two\nlines' }])).toBe('a,b\r\n" padded ","two\nlines"\r\n');
  });

  it('writes a plain-text table aligned for a monospaced font, wide characters counted twice', () => {
    const text = toText(rows);
    const lines = text.trimEnd().split('\n');
    expect(lines[0]).toBe('index  name             note              tags');
    expect(lines[1]).toBe('-----  ---------------  ----------------  ---------');
    expect(lines[3]).toBe('1      佐藤 美穂                          ["a","b"]');
    expect(toText([{ long: 'x'.repeat(80) }]).split('\n')[2]).toBe(`${'x'.repeat(47)}…`);
  });

  it('names the file after the request', () => {
    expect(fileStem('http://localhost:6800/users?limit=10')).toBe('users');
    expect(fileStem('https://x.test/rest-in-pieces/api/users/42')).toBe('users-42');
    expect(fileStem('https://x.test/rest-in-pieces/api/countries/CA?format=csv')).toBe('countries-CA');
  });

  it('offers JSON, CSV and TXT of records, and what it can of a body without them', () => {
    const source = { url: 'http://h/users', rows, json: { results: rows }, raw: '{}', contentType: 'application/json' };
    expect(downloadOf(source, 'json')).toMatchObject({ filename: 'users.json', mime: 'application/json' });
    expect(JSON.parse(downloadOf(source, 'json')?.text ?? '')).toEqual({ results: rows });
    expect(downloadOf(source, 'csv')).toMatchObject({ filename: 'users.csv', mime: 'text/csv' });
    expect(downloadOf(source, 'txt')?.text).toBe(toText(rows));

    const csvBody = {
      url: 'http://h/users?format=csv',
      rows: null,
      json: null,
      raw: 'a,b\r\n1,2\r\n',
      contentType: 'text/csv',
    };
    expect(downloadOf(csvBody, 'json')).toBeNull();
    expect(downloadOf(csvBody, 'csv')?.text).toBe('a,b\r\n1,2\r\n');
    expect(downloadOf(csvBody, 'txt')?.text).toBe('a,b\r\n1,2\r\n');

    const error = {
      url: 'http://h/users',
      rows: null,
      json: { error: 'x' },
      raw: '{"error":"x"}',
      contentType: 'application/json',
    };
    expect(downloadOf(error, 'json')?.text).toBe('{\n  "error": "x"\n}\n');
    expect(downloadOf(error, 'csv')).toBeNull();
    expect(downloadOf({ ...error, raw: '', json: null }, 'txt')).toBeNull();
  });
});
