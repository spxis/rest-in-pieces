import { REST_TABLE_APP_KEYS, REST_TABLE_OPTION_KEYS, RestTable } from '@johnmorrisdotca/rest-in-pieces/element';
import '@johnmorrisdotca/rest-in-pieces/element/define';
import { FAMILY_EMBED_BUILDER_WORDS, familyEmbedBuilder } from '../../../../scripts/family-template.mjs';
import pkg from '../../../api/package.json';
import { TABLE_LOCALES, TABLE_RESOURCES } from './config.js';

const words = {
  en: {
    ...FAMILY_EMBED_BUILDER_WORDS.en,
    pitch: 'Choose a dataset and seed, preview a local sample table and copy the embed code.',
    name: 'REST in Pieces serves repeatable test data.',
    nameLink: 'About the package',
    foot: 'The native API runs locally; frame events contain metadata only.',
    toGallery: 'The playground',
    makerTable: 'A sample-data table',
    makerTableSays: 'Seeded data from the same API used by the playground.',
  },
  ja: {
    ...FAMILY_EMBED_BUILDER_WORDS.ja,
    pitch: 'データセットとシードを選び、サンプルの表をプレビューで確認して、埋め込むコードをコピーできます。',
    name: 'REST in Piecesは、再現できるテストデータを返します。',
    nameLink: 'パッケージについて',
    foot: 'APIはこのページ内で動きます。埋め込みのイベントにはメタデータだけが入ります。',
    toGallery: 'プレイグラウンド',
    makerTable: 'サンプルデータの表',
    makerTableSays: 'プレイグラウンドと同じAPIを使い、シードからデータを作ります。',
  },
};
const row = (id, kind, en, ja, extra = {}) => ({
  id,
  kind,
  group: 'table',
  names: { table: id },
  say: { en: { label: en[0], help: en[1] }, ja: { label: ja[0], help: ja[1] } },
  ...extra,
});
const options = [
  row(
    'resource',
    'choice',
    ['Dataset', 'A native read-only collection.'],
    ['データセット', 'APIの一覧から選びます。'],
    { default: 'names', choices: TABLE_RESOURCES },
  ),
  row('rows', 'number', ['Rows', 'One to fifty records.'], ['行数', '1〜50件から選びます。'], {
    default: 5,
    range: { min: 1, max: 50, step: 1 },
  }),
  row(
    'seed',
    'number',
    ['Seed', 'Repeat the same data with the same setup.'],
    ['シード', '同じ設定でデータを再現できます。'],
    { default: 1, range: { min: 0, max: 4294967295, step: 1 } },
  ),
  row(
    'locale',
    'choice',
    ['Data locale', 'Separate from the interface language.'],
    ['データの言語・地域', '操作の言語とは別に選びます。'],
    { choices: TABLE_LOCALES },
  ),
  row(
    'columns',
    'text',
    ['Columns', 'Comma-separated field names; first four by default.'],
    ['列', '項目名をカンマで区切ります。初期設定は最初の4項目です。'],
  ),
  row('size', 'choice', ['Display size', 'Small, medium or large.'], ['表示の大きさ', '小・中・大を選びます。'], {
    default: 'medium',
    choices: ['small', 'medium', 'large'],
  }),
  row(
    'width',
    'number',
    ['Width', 'Pixels, fitting a narrower parent.'],
    ['幅', 'ピクセルで指定します。狭い表示枠にも収まります。'],
    { range: { min: 200, max: 1000, step: 10 } },
  ),
  row(
    'theme',
    'choice',
    ['Theme', 'Light, dark or the device preference.'],
    ['配色', '明るい配色・暗い配色、または端末に合わせます。'],
    { default: 'auto', choices: ['auto', 'light', 'dark'] },
  ),
  row(
    'lang',
    'choice',
    ['Interface language', 'Labels and status.'],
    ['操作の言語', '見出しと状態の表示に使います。'],
    { choices: ['en', 'ja'] },
  ),
  row('label', 'text', ['Table label', 'A spoken and visible caption.'], ['表の名前', '見出しと読み上げに使います。']),
];
const leftOut = {};
for (const key of REST_TABLE_APP_KEYS)
  leftOut[`app.${key}`] = 'Native app configuration belongs to trusted host options.app.';
for (const key of REST_TABLE_OPTION_KEYS)
  leftOut[`options.${key}`] = 'Native app, arbitrary queries and callbacks belong to trusted host options.';
let mounted;
const page = globalThis.familyLanguage({ id: 'rest-in-pieces', words, onChange: () => mounted?.draw() }),
  heights = {};
const key = (settings) => JSON.stringify(settings);
const builder = familyEmbedBuilder({
  id: 'rest-in-pieces',
  packageName: '@johnmorrisdotca/rest-in-pieces',
  major: pkg.version.split('.')[0],
  site: 'https://spxis.github.io/rest-in-pieces/',
  title: 'REST in Pieces · sample table',
  titleJa: 'サンプルデータの表の埋め込み',
  options,
  leftOut,
  groups: { table: { en: 'The sample table', ja: 'サンプルデータの表' } },
  makers: {
    table: {
      names: 'table',
      element: 'table',
      tag: 'rest-in-pieces-table',
      embed: 'embed/',
      required: ['resource', 'rows', 'seed', 'size'],
      description: 'makerTableSays',
      formats: ['element', 'iframe', 'module', 'react', 'vue', 'svelte', 'angular', 'html', 'url'],
      width: 640,
      height: (settings) => Math.max(heights[key(settings)] ?? 0, 200 + Number(settings.rows ?? 5) * 70),
    },
  },
  code: ({ maker, format, settings }) => {
    if ((format === 'iframe' || format === 'url') && settings.lang === undefined)
      return builder.codeFor(maker, format, options, { ...settings, lang: page.lang });
    return undefined;
  },
});
builder.validateCoverage({
  table: RestTable.observedAttributes,
  app: REST_TABLE_APP_KEYS,
  options: REST_TABLE_OPTION_KEYS,
});
mounted = builder.mount({
  words,
  language: () => page,
  initial: { table: { resource: 'names', rows: 5, seed: 1, size: 'medium', lang: page.lang } },
  renderPreview: ({ stage, attrs, settings }) => {
    const table = document.createElement('rest-in-pieces-table');
    for (const [name, value] of attrs) table.setAttribute(name, value);
    const measure = () => {
      heights[key(settings)] = Math.ceil(table.getBoundingClientRect().height) + 80;
      mounted?.refreshCode();
    };
    table.addEventListener('rest-in-pieces-load', measure);
    stage.append(table);
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return {
      destroy() {
        observer.disconnect();
        table.remove();
      },
    };
  },
});
