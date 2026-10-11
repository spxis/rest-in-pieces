import '@johnmorrisdotca/rest-in-pieces/element/define';
import { TABLE_LOCALES, TABLE_RESOURCES } from './config.js';

const query = new URLSearchParams(location.search),
  table = document.createElement('rest-in-pieces-table');
table.setAttribute('size', 'medium');
for (const [name, choices] of [
  ['resource', TABLE_RESOURCES],
  ['locale', TABLE_LOCALES],
  ['lang', ['en', 'ja']],
  ['theme', ['auto', 'light', 'dark']],
  ['size', ['small', 'medium', 'large']],
])
  if (choices.includes(query.get(name))) table.setAttribute(name, query.get(name));
for (const [name, min, max] of [
  ['rows', 1, 50],
  ['seed', 0, 4294967295],
  ['width', 100, 2000],
]) {
  const value = query.get(name);
  if (value !== null && /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max)
    table.setAttribute(name, value);
}
for (const name of ['label', 'columns']) {
  const value = query.get(name);
  if (value !== null && value.length <= 200) table.setAttribute(name, value);
}
if (query.get('lang') === 'ja') document.documentElement.lang = 'ja';
for (const type of ['rest-in-pieces-load', 'rest-in-pieces-error'])
  table.addEventListener(type, (event) => {
    if (parent !== window)
      parent.postMessage({ type: event.type, detail: JSON.parse(JSON.stringify(event.detail)) }, '*');
  });
document.body.append(table);
