import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { CliError, parseCliArgs, usage } from '../src/cli.ts';
import { loadMock } from '../src/mockCommand.ts';
import { petshop } from './specs/petshop.ts';

let dir = '';
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rest-in-pieces-mock-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const file = (name: string, text: string) => {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
};
const options = { safe: false, log: false };

describe('serve --openapi on the command line', () => {
  it('reads --openapi on serve and on the plain command, with a space or an equals sign', () => {
    expect(parseCliArgs(['serve', '--openapi', 'api.yaml'])).toMatchObject({
      kind: 'serve',
      openapi: 'api.yaml',
      port: 6800,
    });
    expect(parseCliArgs(['--openapi=api.json', '--port', '6840'])).toMatchObject({ openapi: 'api.json', port: 6840 });
    expect(parseCliArgs(['serve'])).toEqual(parseCliArgs([]));
    expect(parseCliArgs(['serve', '--port=6841', '--safe', '--openapi', 'a.yml'])).toMatchObject({
      safe: true,
      openapi: 'a.yml',
    });
    expect('openapi' in parseCliArgs([])).toBe(false);
  });

  it('refuses a missing value, a second --openapi and --session, which keeps writes to datasets a mock does not have', () => {
    expect(() => parseCliArgs(['--openapi'])).toThrow('--openapi needs a value');
    expect(() => parseCliArgs(['--openapi', '--safe'])).toThrow('--openapi needs a value');
    expect(() => parseCliArgs(['--openapi', 'a', '--openapi', 'b'])).toThrow('given twice');
    expect(() => parseCliArgs(['serve', '--openapi', 'a', '--session'])).toThrow(CliError);
    // The environment's session setting is for the built-in datasets, and is left alone.
    expect(parseCliArgs(['--openapi', 'a'], { REST_IN_PIECES_SESSION: 'true' })).toMatchObject({ openapi: 'a' });
    expect(() => parseCliArgs(['serve', '--nope'])).toThrow('Unknown option');
  });

  it('is in the help text', () => {
    expect(usage).toContain('--openapi <file>');
    expect(usage).toContain('rest-in-pieces serve --openapi ./openapi.yaml');
    expect(usage).toContain('[serve]');
  });
});

describe('loadMock', () => {
  it('reads a YAML or a JSON document, and answers from it', async () => {
    for (const path of [file('petshop.yaml', stringify(petshop)), file('petshop.json', JSON.stringify(petshop))]) {
      const { mock } = loadMock(path, options);
      expect(mock.title).toBe('Pet shop');
      const res = await mock.app.request('/pets/12');
      expect(((await res.json()) as { id: number }).id).toBe(12);
    }
  });

  it('prints what is mocked, and what it answers with', () => {
    const { banner } = loadMock(file('banner.json', JSON.stringify(petshop)), options);
    const text = banner('http://localhost:6800');
    expect(text).toContain('Mocking Pet shop 1.2.0');
    expect(text).toContain('13 operations at http://localhost:6800');
    expect(text).toMatch(/GET\s+\/pets\s+-> 200/);
    expect(text).toMatch(/POST\s+\/pets\s+-> 201/);
    expect(text).toContain('?delay=1500');
    expect(text).toContain('http://localhost:6800/__mock/docs');
  });

  it('lists forty operations and counts the rest', () => {
    const paths = Object.fromEntries(
      Array.from({ length: 45 }, (_, i) => [`/r${i}`, { get: { responses: { '204': { description: 'ok' } } } }]),
    );
    const { banner, mock } = loadMock(file('many.json', JSON.stringify({ openapi: '3.0.0', paths })), options);
    expect(mock.operations).toHaveLength(45);
    expect(mock.title).toBe('API');
    const text = banner('http://x');
    expect(text).toContain('…and 5 more');
    expect(text).toContain('Mocking API from');
    expect(text.split('\n').filter((line) => line.startsWith('  GET'))).toHaveLength(40);
  });

  it('says in a sentence what is wrong with a file, never a stack trace', () => {
    expect(() => loadMock(join(dir, 'missing.yaml'), options)).toThrow(/Cannot read .*missing\.yaml/);
    expect(() => loadMock(file('broken.json', '{ nope'), options)).toThrow('is not valid JSON');
    expect(() => loadMock(file('broken.yaml', 'a: [1, 2'), options)).toThrow('is not valid YAML');
    expect(() => loadMock(file('plain.json', '{"hello": 1}'), options)).toThrow(
      /cannot be mocked:\nThis is not an OpenAPI/,
    );
    expect(() =>
      loadMock(
        file(
          'external.json',
          JSON.stringify({
            openapi: '3.0.0',
            paths: { '/a': { get: { responses: { '200': { $ref: 'other.yaml#/ok' } } } } },
          }),
        ),
        options,
      ),
    ).toThrow(/points outside the document/);
    const bad = loadMock.bind(
      null,
      file(
        'keyword.json',
        JSON.stringify({
          openapi: '3.0.0',
          paths: {
            '/a': {
              get: {
                responses: { '200': { description: 'x', content: { 'application/json': { schema: { not: {} } } } } },
              },
            },
          },
        }),
      ),
      options,
    );
    expect(bad).toThrow(CliError);
    expect(bad).toThrow('"not"');
  });

  it('refuses a YAML file that expands into more than it is, rather than hanging on it', () => {
    let text = 'a0: &a0 [x, x]\n';
    for (let i = 1; i <= 40; i++) text += `a${i}: &a${i} [*a${i - 1}, *a${i - 1}]\n`;
    const started = performance.now();
    expect(() =>
      loadMock(
        file(
          'bomb.yaml',
          `openapi: 3.0.0\nx-bomb:\n${text
            .split('\n')
            .map((line) => `  ${line}`)
            .join('\n')}\npaths: {}\n`,
        ),
        options,
      ),
    ).toThrow(CliError);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
