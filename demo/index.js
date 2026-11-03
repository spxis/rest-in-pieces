// The demo index: links to the other pages, and a live reader of the public static API (the plain files under ../api/).
import { applyWords, say, wireChrome } from './common.js';

const $ = (id) => document.getElementById(id);
const ABSOLUTE = 'https://spxis.github.io/rest-in-pieces/api/';
const state = { index: null, dataset: 'users', locale: 'en-CA', page: 1, pages: 1 };

/** A cell: short text, with a record's nested values shown as JSON. */
const cell = (value) => (value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''));

function path(format = 'json') {
  const folder = state.index.folders[state.locale] ?? '';
  const base = `${folder}${state.dataset}`;
  return state.page === 1 && format === 'json'
    ? `${base}.json`
    : state.page === 1
      ? `${base}.${format}`
      : `${base}/page/${state.page}.${format}`;
}

function drawCode() {
  const file = path();
  $('ex-address').textContent = `${ABSOLUTE}${file}`;
  $('ex-curl').textContent = `curl ${ABSOLUTE}${file}\ncurl ${ABSOLUTE}${path('csv')}`;
  $('ex-fetch').textContent =
    `const base = '${ABSOLUTE}';\nconst { results } = await (await fetch(\`\${base}${file}\`)).json();`;
  const formats = $('ex-formats');
  for (const link of formats.querySelectorAll('a')) link.remove();
  for (const format of state.index.formats) {
    const link = Object.assign(document.createElement('a'), {
      href: `../api/${path(format)}`,
      textContent: `.${format}`,
      className: 'fmt',
    });
    formats.append(link);
  }
  formats.hidden = false;
}

function drawTable(body) {
  const results = Array.isArray(body) ? body : body.results;
  const total = body.metadata?.total ?? results.length;
  const offset = body.metadata?.parameters?.offset ?? (state.page - 1) * (state.index.pageSize ?? 10);
  state.pages = Math.max(1, Math.ceil(total / (state.index.pageSize ?? 10)));
  const table = $('ex-table');
  const head = table.tHead;
  const rows = table.tBodies[0];
  head.replaceChildren();
  rows.replaceChildren();
  if (!results.length) {
    $('ex-status').textContent = say('explorerEmpty');
    $('ex-table-wrap').hidden = true;
    return;
  }
  const columns = Object.keys(results[0]).slice(0, 6);
  const tr = document.createElement('tr');
  for (const name of columns)
    tr.append(Object.assign(document.createElement('th'), { scope: 'col', textContent: name }));
  head.append(tr);
  for (const record of results) {
    const row = document.createElement('tr');
    for (const name of columns)
      row.append(
        Object.assign(document.createElement('td'), { textContent: cell(record[name]), title: cell(record[name]) }),
      );
    rows.append(row);
  }
  $('ex-table-wrap').hidden = false;
  $('ex-status').textContent = say('explorerRecords', { from: offset + 1, to: offset + results.length, total });
}

let ticket = 0;
async function load() {
  const mine = ++ticket;
  drawCode();
  $('ex-prev').disabled = state.page <= 1;
  $('ex-status').textContent = say('explorerLoading');
  try {
    const response = await fetch(`../api/${path()}`);
    if (mine !== ticket) return;
    if (!response.ok) throw new Error(String(response.status));
    drawTable(await response.json());
    $('ex-next').disabled = state.page >= state.pages;
  } catch {
    if (mine !== ticket) return;
    $('ex-table-wrap').hidden = true;
    $('ex-status').textContent = say('explorerNone');
  }
}

function fillDatasets() {
  const select = $('ex-dataset');
  const names = (state.index.datasets[state.locale] ?? []).map((dataset) => dataset.name);
  if (!names.includes(state.dataset)) state.dataset = names[0];
  select.replaceChildren(
    ...names.map((name) => Object.assign(document.createElement('option'), { value: name, textContent: name })),
  );
  select.value = state.dataset;
}

async function start() {
  try {
    const response = await fetch('../api/index.json');
    if (!response.ok) throw new Error(String(response.status));
    state.index = await response.json();
  } catch {
    $('ex-status').textContent = say('explorerOffline');
    $('ex-prev').disabled = true;
    $('ex-next').disabled = true;
    return;
  }
  fillDatasets();
  $('ex-dataset').addEventListener('change', (event) => {
    state.dataset = event.target.value;
    state.page = 1;
    load();
  });
  $('ex-locale').addEventListener('change', (event) => {
    state.locale = event.target.value;
    state.page = 1;
    fillDatasets();
    load();
  });
  $('ex-prev').addEventListener('click', () => {
    state.page = Math.max(1, state.page - 1);
    load();
  });
  $('ex-next').addEventListener('click', () => {
    state.page = Math.min(state.pages, state.page + 1);
    load();
  });
  load();
}

const redraw = () => {
  document.title = `${say('indexTitle')} · REST in Pieces`;
  applyWords();
  if (state.index) load();
};
wireChrome(redraw);
document.title = `${say('indexTitle')} · REST in Pieces`;
start();
