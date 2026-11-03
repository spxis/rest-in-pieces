// The demo pages (demo/): the setup builder writes only what the package reads. Its commands are parsed with the real
// command-line parser, its in-process options run through the real createApp, and both languages have every word.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { flagsFromEnv, parseCliArgs, safeFromEnv, sessionFromEnv, streamsFromEnv } from '../apps/api/src/cli.ts';
import { createApp } from '../apps/api/src/core.ts';
import {
  APPLIES,
  appOptions,
  buildSetup,
  changed,
  DEFAULTS,
  DOCS,
  FORMATS,
  generateArguments,
  LOCALES,
  normalise,
  problems,
  serveArguments,
  serveEnvironment,
  shellQuote,
  TARGETS,
} from '../demo/builder-code.js';
import { WORDS } from '../demo/words.js';

const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const environment = (state) => Object.fromEntries(serveEnvironment(state));

describe('the setup builder', () => {
  it('builds something for every way of running it, with the defaults', () => {
    for (const target of TARGETS) {
      const result = buildSetup({ target, fields: DEFAULTS.fields });
      assert.deepEqual(result.problems, [], target);
      assert.ok(result.steps.length > 0, target);
      for (const step of result.steps) assert.ok(step.code.trim().length > 0, `${target} ${step.label}`);
      assert.ok(result.docs.length > 0, target);
    }
    assert.deepEqual(Object.keys(APPLIES).sort(), [...TARGETS].sort());
    assert.deepEqual(Object.keys(DOCS).sort(), [...TARGETS].sort());
  });

  it('writes a command-line run the real parser reads back', () => {
    for (const port of [6800, 6900, 0])
      for (const network of [false, true])
        for (const session of [false, true])
          for (const safe of [true, false])
            for (const streams of [true, false])
              for (const flags of ['auto', 'cdn'])
                for (const openapi of ['', 'openapi.yaml', 'my api.json']) {
                  const state = { target: 'cli', port, network, session, safe, streams, flags, openapi };
                  const wanted = normalise(state);
                  if (openapi && session) {
                    assert.equal(problems(state)[0][1], 'faultOpenapiSession');
                    continue;
                  }
                  const args = serveArguments(state);
                  const read = parseCliArgs(args, environment(state));
                  assert.equal(read.kind, 'serve');
                  assert.equal(read.port, port);
                  assert.equal(read.host, network ? '0.0.0.0' : 'localhost');
                  assert.equal(read.session, wanted.session);
                  assert.equal(read.safe, wanted.safe);
                  assert.equal(read.openapi, openapi === '' ? undefined : openapi);
                  assert.equal(streamsFromEnv(environment(state)), streams);
                  assert.equal(flagsFromEnv(environment(state)), flags);
                }
  });

  it('writes the environment of a Docker run that the real command reads back', () => {
    for (const session of [false, true])
      for (const safe of [true, false])
        for (const streams of [true, false])
          for (const flags of ['auto', 'cdn']) {
            const code = buildSetup({ target: 'docker', port: 6900, session, safe, streams, flags }).steps[0].code;
            const env = Object.fromEntries(
              [...code.matchAll(/-e (\w+)=(\w+)/g)].map(([, name, value]) => [name, value]),
            );
            assert.equal(sessionFromEnv(env), session);
            assert.equal(safeFromEnv(env), safe);
            assert.equal(streamsFromEnv(env), streams);
            assert.equal(flagsFromEnv(env), flags);
            assert.match(code, /-p 6900:6800/);
          }
  });

  it('quotes so a shell hands the program the very arguments that were built', () => {
    const state = {
      target: 'offline',
      fields: "name:person.fullName,status:pick(a,b|1,2),note:'quoted'",
      output: 'out dir/people.csv',
      format: 'csv',
      bom: true,
    };
    const args = generateArguments(state);
    const printed = execFileSync('sh', ['-c', `printf '%s\\n' ${args.map(shellQuote).join(' ')}`], {
      encoding: 'utf8',
    });
    assert.deepEqual(printed.slice(0, -1).split('\n'), args);
    const command = buildSetup(state).steps[0].code;
    assert.ok(command.startsWith('npx @johnmorrisdotca/rest-in-pieces generate --fields '));
  });

  it('writes an offline run the real parser reads back', () => {
    for (const format of FORMATS)
      for (const locale of LOCALES.map(([code]) => code)) {
        const state = {
          target: 'offline',
          fields: 'a:number.int(1,9)',
          constraints: '',
          count: 25,
          seed: 7,
          format,
          table: 'people',
          batch: 50,
          transaction: true,
          bom: true,
          locale,
          safe: false,
        };
        const read = parseCliArgs(generateArguments(state));
        assert.equal(read.kind, 'generate');
        assert.equal(read.format, format);
        assert.equal(read.count, 25);
        assert.equal(read.seed, 7);
        assert.equal(read.locale, locale);
        assert.equal(read.safe, false);
        assert.equal(read.table, format === 'sql' ? 'people' : 'records');
        assert.equal(read.batch, format === 'sql' ? 50 : 1);
        assert.equal(read.transaction, format === 'sql');
        assert.equal(read.bom, format === 'csv');
      }
    const fromSchema = parseCliArgs(generateArguments({ target: 'offline', source: 'schema', schema: 'people.json' }));
    assert.equal(fromSchema.schema, 'people.json');
    const constrained = parseCliArgs(
      generateArguments({ target: 'offline', fields: 'a:date.past,b:date.future', constraints: 'b>a' }),
    );
    assert.deepEqual(constrained.constraints, ['b>a']);
  });

  it('writes in-process options the real createApp takes', async () => {
    const plain = createApp(appOptions({ target: 'tests' }));
    assert.equal((await plain.request('/health')).status, 200);
    const kept = createApp(appOptions({ target: 'tests', session: true, safe: false, streams: false, flags: 'cdn' }));
    assert.deepEqual(appOptions({ session: true, safe: false, streams: false, flags: 'cdn' }), {
      session: true,
      safe: false,
      streams: false,
      flags: 'cdn',
    });
    assert.equal((await kept.request('/health')).status, 200);
    const session = await (await kept.request('/session')).json();
    assert.equal(session.enabled, true);
    assert.equal((await (await plain.request('/session')).json()).enabled, false);
    const safe = await (await plain.request('/users?seed=1&limit=1')).json();
    const unsafe = await (await kept.request('/users?seed=1&limit=1')).json();
    assert.match(safe.results[0].email, /@example\.(com|org|net)$/);
    assert.doesNotMatch(unsafe.results[0].email, /@example\.(com|org|net)$/);
    assert.deepEqual(appOptions({}), {});
  });

  it('puts the choices in the code of each way of running it', () => {
    const code = (state) =>
      buildSetup(state)
        .steps.map((step) => step.code)
        .join('\n');
    assert.match(
      code({ target: 'docker', port: 6900, session: true, safe: false }),
      /-p 6900:6800[\s\S]*REST_IN_PIECES_SESSION=true[\s\S]*REST_IN_PIECES_SAFE=false[\s\S]*ghcr\.io\/spxis\/rest-in-pieces/,
    );
    assert.match(code({ target: 'tests', session: true }), /createApp\(\{ session: true \}\)[\s\S]*beforeEach/);
    assert.match(code({ target: 'tests' }), /createApp\(\)/);
    assert.match(
      code({ target: 'tab', base: '/mock', session: true }),
      /installInBrowserApi\(\{ base: '\/mock', app: \{ session: true \} \}\)[\s\S]*fetch\('\/mock\/users/,
    );
    assert.match(code({ target: 'vite', base: '/mock' }), /restInPieces\(\{ base: '\/mock' \}\)/);
    assert.match(code({ target: 'vite' }), /restInPieces\(\)/);
    assert.match(
      code({ target: 'mswBrowser', safe: false }),
      /msw init public[\s\S]*restInPiecesHandlers\(\{ http, app: \{ safe: false \} \}\)/,
    );
    assert.match(code({ target: 'mswNode' }), /base: 'http:\/\/localhost\/api'/);
    assert.match(
      code({ target: 'offline', fields: 'a:number.int(1,9)', format: 'sql', table: 'people' }),
      /--format sql --table people[\s\S]*> records\.sql/,
    );
  });

  it('builds nothing while a choice is wrong, and says which', () => {
    const keys = (state) => problems(state).map(([, key]) => key);
    assert.deepEqual(keys({ target: 'cli', port: 70000 }), ['faultPort']);
    assert.deepEqual(keys({ target: 'cli', port: Number.NaN }), ['faultPort']);
    assert.deepEqual(keys({ target: 'vite', base: 'api' }), ['faultBasePath']);
    assert.deepEqual(keys({ target: 'mswNode', base: '/api/' }), ['faultBaseAbsolute']);
    assert.deepEqual(keys({ target: 'offline', fields: ' ' }), ['faultFields']);
    assert.deepEqual(keys({ target: 'offline', source: 'schema', schema: '' }), ['faultSchema']);
    assert.deepEqual(keys({ target: 'offline', count: 0 }), ['faultCount']);
    assert.deepEqual(keys({ target: 'offline', seed: -1 }), ['faultSeed']);
    assert.deepEqual(keys({ target: 'offline', format: 'sql', table: '1bad' }), ['faultTable']);
    assert.deepEqual(keys({ target: 'offline', format: 'sql', batch: 1001 }), ['faultBatch']);
    assert.deepEqual(keys({ target: 'offline', format: 'csv', table: '1bad' }), []);
    assert.equal(buildSetup({ target: 'cli', port: 99999 }).steps.length, 0);
    assert.throws(() => parseCliArgs(['--port', '99999']));
  });

  it('turns a setup into a link and back, writing only what differs', () => {
    const state = normalise({ target: 'vite', base: '/mock', session: true });
    const link = changed(state);
    assert.deepEqual(link, { target: 'vite', base: '/mock', session: true });
    assert.deepEqual(
      normalise(
        Object.fromEntries(new URLSearchParams(Object.entries(link).map(([key, value]) => [key, String(value)]))),
      ),
      state,
    );
    assert.deepEqual(changed({ target: 'cli' }), { target: 'cli' });
    assert.equal(normalise({ target: 'nonsense' }).target, 'cli');
  });
});

describe('the demo pages', () => {
  it('have every word they use, in both languages', () => {
    assert.deepEqual(Object.keys(WORDS.ja).sort(), Object.keys(WORDS.en).sort());
    for (const [lang, words] of Object.entries(WORDS))
      for (const [key, value] of Object.entries(words)) assert.ok(value.trim().length > 0, `${lang} ${key}`);
    const used = new Set();
    for (const file of ['demo/index.html', 'demo/builder.html'])
      for (const match of text(file).matchAll(/data-say(?:-label|-title)?="(\w+)"/g)) used.add(match[1]);
    for (const file of ['demo/builder.js', 'demo/index.js', 'demo/common.js'])
      for (const match of text(file).matchAll(/(?:\bsay\(|dataset\.say = |data-say=")'?(\w+)'/g)) used.add(match[1]);
    for (const [, , word, help] of text('demo/builder.js').matchAll(
      /\['\w+', '(text|check|select)', '(\w+)', (?:'(\w+)'|null)/g,
    ))
      for (const key of [word, help]) if (key) used.add(key);
    for (const key of used) assert.ok(key in WORDS.en, `${key} has no words`);
    for (const target of TARGETS)
      for (const key of [`${target}Label`, `${target}Says`]) assert.ok(key in WORDS.en, key);
    for (const [target, docs] of Object.entries(DOCS))
      for (const [key] of docs) assert.ok(key in WORDS.en, `${target} ${key}`);
    for (const key of [
      'port',
      'network',
      'session',
      'safe',
      'streams',
      'flags',
      'base',
      'openapi',
      'source',
      'fields',
      'constraints',
      'schema',
      'count',
      'seed',
      'format',
      'table',
      'batch',
      'transaction',
      'bom',
      'locale',
      'output',
    ])
      assert.ok(key in WORDS.en, key);
  });

  it('load only their own files', () => {
    for (const file of ['demo/index.html', 'demo/builder.html'])
      assert.doesNotMatch(text(file), /(?:src|href)="https?:/, `${file} loads from another address`);
    for (const file of ['demo/builder.js', 'demo/index.js', 'demo/common.js'])
      for (const line of text(file)
        .split('\n')
        .filter((line) => line.startsWith('import ')))
        assert.match(line, /from '\.\//, `${file}: ${line}`);
    for (const file of ['demo/builder-code.js', 'demo/words.js'])
      assert.equal(
        text(file)
          .split('\n')
          .some((line) => line.startsWith('import ') && !line.includes("from '")),
        false,
      );
  });
});
