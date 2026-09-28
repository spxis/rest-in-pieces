import { Plus, Trash2 } from 'lucide-react';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import type { PhraseKey } from '../i18n/phrases.ts';
import { type Field, MAX_FIELDS } from '../lib/config.ts';

const FIELD_NAME = /^[A-Za-z_][\w-]{0,63}$/;

export interface FieldProblem {
  key: PhraseKey;
  name: string;
}

export function fieldProblem(fields: Field[]): FieldProblem | null {
  const names = fields.map((field) => field.name.trim());
  const invalid = names.find((name) => !FIELD_NAME.test(name) || name === 'index');
  if (invalid !== undefined) return { key: 'fields.invalid', name: invalid };
  const duplicate = names.find((name, i) => names.indexOf(name) !== i);
  return duplicate ? { key: 'fields.duplicate', name: duplicate } : null;
}

export function FieldsEditor({
  fields,
  generators,
  state,
  onChange,
}: {
  fields: Field[];
  generators: Record<string, string[]>;
  state: 'loading' | 'ready' | 'offline';
  onChange: (fields: Field[]) => void;
}) {
  const { say } = useSpeaker();
  const update = (id: number, patch: Partial<Field>) =>
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  const add = () => {
    const id = Math.max(0, ...fields.map((field) => field.id)) + 1;
    onChange([...fields, { id, name: `field${id}`, type: 'lorem.word' }]);
  };
  const problem = fieldProblem(fields);
  const known = new Set(
    Object.entries(generators).flatMap(([module, methods]) => methods.map((m) => `${module}.${m}`)),
  );

  return (
    <div className="form-section fields-section">
      <div className="field-heading">
        <div>
          <span className="section-caption">{say('fields.heading')}</span>
          <span className="field-count">
            {fields.length} / {MAX_FIELDS}
          </span>
        </div>
        <button type="button" className="small-command" onClick={add} disabled={fields.length >= MAX_FIELDS}>
          <Plus size={14} /> {say('fields.add')}
        </button>
      </div>
      <div className="field-list">
        {fields.map((field) => (
          <div className="field-row" key={field.id}>
            <input
              aria-label={say('fields.name')}
              value={field.name}
              spellCheck={false}
              onChange={(event) => update(field.id, { name: event.target.value })}
            />
            <select
              aria-label={say('fields.type')}
              value={field.type}
              onChange={(event) => update(field.id, { type: event.target.value })}
            >
              {!known.has(field.type) && <option value={field.type}>{field.type}</option>}
              {Object.entries(generators).map(([module, methods]) => (
                <optgroup label={module} key={module}>
                  {methods.map((method) => (
                    <option key={method} value={`${module}.${method}`}>
                      {module}.{method}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              className="icon-button remove-field"
              title={say('fields.remove')}
              aria-label={say('fields.removeNamed', { name: field.name })}
              onClick={() => onChange(fields.filter((item) => item.id !== field.id))}
              disabled={fields.length === 1}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      {problem && (
        <span className="inline-note warning" role="alert">
          {say(problem.key, { name: problem.name })}
        </span>
      )}
      {state === 'loading' && <span className="inline-note">{say('fields.loading')}</span>}
      {state === 'offline' && <span className="inline-note warning">{say('fields.offline')}</span>}
    </div>
  );
}
