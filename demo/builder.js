// The setup builder page: the choices on the left, the command or code on the right. The logic is in builder-code.js.
import { APPLIES, buildSetup, changed, DEFAULTS, FORMATS, LOCALES, normalise, TARGETS } from './builder-code.js';
import { applyWords, copyText, currentLang, say, wireChrome } from './common.js';

/** The choices, in the order the page shows them: [key, kind, words key, help key, extra]. */
const OPTIONS = [
  ['port', 'text', 'port', 'portHelp'],
  ['base', 'text', 'base', 'baseHelp'],
  ['network', 'check', 'network', 'networkHelp'],
  ['openapi', 'text', 'openapi', 'openapiHelp'],
  ['session', 'check', 'session', 'sessionHelp'],
  ['safe', 'check', 'safe', 'safeHelp'],
  ['streams', 'check', 'streams', 'streamsHelp'],
  [
    'flags',
    'select',
    'flags',
    'flagsHelp',
    [
      ['auto', 'flagsAuto'],
      ['cdn', 'flagsCdn'],
    ],
  ],
  [
    'source',
    'select',
    'source',
    null,
    [
      ['fields', 'sourceFields'],
      ['schema', 'sourceSchema'],
    ],
  ],
  ['fields', 'text', 'fields', 'fieldsHelp'],
  ['constraints', 'text', 'constraints', 'constraintsHelp'],
  ['schema', 'text', 'schema', 'schemaHelp'],
  ['count', 'text', 'count', 'countHelp'],
  ['seed', 'text', 'seed', 'seedHelp'],
  ['format', 'select', 'format', null, FORMATS.map((format) => [format, null])],
  ['table', 'text', 'table', 'tableHelp'],
  ['batch', 'text', 'batch', 'batchHelp'],
  ['transaction', 'check', 'transaction', null],
  ['bom', 'check', 'bom', 'bomHelp'],
  ['locale', 'select', 'locale', null, LOCALES.map(([code, name]) => [code, null, `${name} (${code})`])],
  ['output', 'text', 'output', 'outputHelp'],
];

let state = normalise(Object.fromEntries(new URLSearchParams(location.search)));
const $ = (id) => document.getElementById(id);
const inputs = new Map();

function makeTargets() {
  const box = $('targets');
  for (const target of TARGETS) {
    const label = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'target', value: target });
    input.addEventListener('change', () => {
      state = normalise({ ...state, target });
      render();
    });
    const span = document.createElement('span');
    span.dataset.say = `${target}Label`;
    label.append(input, span);
    box.append(label);
    inputs.set(`target:${target}`, input);
  }
}

function makeOptions() {
  const box = $('options');
  for (const [key, kind, word, help, choices] of OPTIONS) {
    const wrap = document.createElement('div');
    wrap.className = kind === 'check' ? 'opt check' : 'opt';
    wrap.dataset.option = key;
    const id = `opt-${key}`;
    let control;
    if (kind === 'select') {
      control = Object.assign(document.createElement('select'), { id, className: 'field' });
      for (const [value, say, literal] of choices) {
        const option = Object.assign(document.createElement('option'), { value });
        if (say) option.dataset.say = say;
        else option.textContent = literal ?? value;
        control.append(option);
      }
    } else {
      control = Object.assign(document.createElement('input'), { id, type: kind === 'check' ? 'checkbox' : 'text' });
      if (kind === 'text') {
        if (['port', 'count', 'seed', 'batch'].includes(key)) control.inputMode = 'numeric';
        else control.className = 'mono';
        control.spellcheck = false;
        control.autocomplete = 'off';
      }
    }
    control.dataset.testid = `opt-${key}`;
    control.addEventListener(kind === 'text' ? 'input' : 'change', () => {
      const value = kind === 'check' ? control.checked : control.value;
      state = normalise({ ...state, [key]: value });
      draw(false);
    });
    const label = document.createElement('label');
    label.htmlFor = id;
    label.dataset.say = word;
    const note = document.createElement('p');
    note.className = 'fine';
    if (help) note.dataset.say = help;
    if (kind === 'check') wrap.append(control, label, note);
    else wrap.append(label, control, note);
    box.append(wrap);
    inputs.set(key, control);
  }
}

/** Puts the state into the controls (not into the one being typed in, so the cursor stays). */
function sync(typing) {
  for (const target of TARGETS) inputs.get(`target:${target}`).checked = state.target === target;
  for (const [key, kind] of OPTIONS) {
    const control = inputs.get(key);
    const wrap = control.closest('.opt');
    wrap.hidden =
      !APPLIES[state.target].includes(key) ||
      (key === 'schema' && state.source !== 'schema') ||
      (['fields', 'constraints'].includes(key) && state.source !== 'fields') ||
      (['table', 'batch', 'transaction'].includes(key) && state.format !== 'sql') ||
      (key === 'bom' && state.format !== 'csv');
    if (document.activeElement === control && typing) continue;
    if (kind === 'check') control.checked = state[key];
    else control.value = Number.isNaN(state[key]) ? '' : String(state[key]);
  }
  // MSW in Node needs an absolute base, so the same choice has other words and another example there.
  const node = state.target === 'mswNode';
  const base = inputs.get('base');
  base.placeholder = node ? 'http://localhost/api' : '/api';
  const wrap = base.closest('.opt');
  wrap.querySelector('label').dataset.say = node ? 'baseNode' : 'base';
  wrap.querySelector('.fine').dataset.say = node ? 'baseNodeHelp' : 'baseHelp';
  inputs.get('openapi').placeholder = 'openapi.yaml';
  inputs.get('schema').placeholder = 'people.json';
  inputs.get('output').placeholder = 'people.ndjson';
  inputs.get('constraints').placeholder = 'end>start';
  inputs.get('count').placeholder = String(DEFAULTS.count);
}

function drawOutput() {
  const result = buildSetup(state);
  $('says').dataset.say = result.summary;
  const problems = $('problems');
  problems.hidden = result.problems.length === 0;
  problems.replaceChildren();
  if (result.problems.length) {
    const title = document.createElement('h3');
    title.dataset.say = 'problemsTitle';
    const list = document.createElement('ul');
    for (const [, message, values] of result.problems) {
      const item = document.createElement('li');
      item.dataset.say = message;
      item.dataset.values = JSON.stringify(values);
      list.append(item);
    }
    problems.append(title, list);
  }
  const steps = $('steps');
  steps.replaceChildren();
  for (const step of result.steps) {
    const section = document.createElement('section');
    section.className = 'step';
    section.dataset.testid = `step-${step.label}`;
    const heading = document.createElement('h3');
    heading.dataset.say = step.label;
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = step.code;
    code.dataset.testid = `code-${step.label}`;
    code.lang = step.lang;
    pre.append(code);
    pre.tabIndex = 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.primary = 'true';
    button.dataset.say = 'copy';
    button.dataset.testid = `copy-${step.label}`;
    button.addEventListener('click', async () => {
      const ok = await copyText(step.code);
      $('status').textContent = ok ? say('copied') : say('copyFailed');
    });
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(button);
    section.append(heading, pre, actions);
    steps.append(section);
  }
  const docs = $('docs');
  docs.replaceChildren();
  for (const [key, href] of result.docs) {
    const item = document.createElement('li');
    const link = Object.assign(document.createElement('a'), { href });
    link.dataset.say = key;
    item.append(link);
    docs.append(item);
  }
}

/** Fills the words, including the faults that carry numbers. */
function words() {
  document.title = `${say('builderTitle')} · REST in Pieces`;
  applyWords();
  for (const item of document.querySelectorAll('#problems li[data-values]'))
    item.textContent = say(item.dataset.say, JSON.parse(item.dataset.values));
}

function draw(typing) {
  sync(typing);
  drawOutput();
  words();
  const url = new URL(location.href);
  url.search = new URLSearchParams(
    Object.entries(changed(state)).map(([key, value]) => [key, String(value)]),
  ).toString();
  history.replaceState(null, '', url);
}

function render() {
  draw(false);
}

makeTargets();
makeOptions();
$('again').addEventListener('click', () => {
  state = normalise({});
  render();
});
$('share').addEventListener('click', async () => {
  const link = new URL(location.href);
  link.search = new URLSearchParams(
    Object.entries(changed(state)).map(([key, value]) => [key, String(value)]),
  ).toString();
  const lang = currentLang();
  if (lang === 'ja') link.searchParams.set('lang', 'ja');
  $('status').textContent = (await copyText(link.href)) ? say('linkCopied') : link.href;
});
wireChrome(words);
render();
