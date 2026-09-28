import { Plus, Trash2 } from 'lucide-react';
import { type Field, MAX_FIELDS } from '../lib/config.ts';

const FIELD_NAME = /^[A-Za-z_][\w-]{0,63}$/;

export function fieldProblem(fields: Field[]): string | null {
  const names = fields.map((field) => field.name.trim());
  const invalid = names.find((name) => !FIELD_NAME.test(name) || name === 'index');
  if (invalid !== undefined) return `"${invalid}" is not a valid field name.`;
  const duplicate = names.find((name, i) => names.indexOf(name) !== i);
  return duplicate ? `"${duplicate}" is used twice.` : null;
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
          <span className="section-caption">RECORD FIELDS</span>
          <span className="field-count">
            {fields.length} / {MAX_FIELDS}
          </span>
        </div>
        <button type="button" className="small-command" onClick={add} disabled={fields.length >= MAX_FIELDS}>
          <Plus size={14} /> Add field
        </button>
      </div>
      <div className="field-list">
        {fields.map((field) => (
          <div className="field-row" key={field.id}>
            <input
              aria-label="Field name"
              value={field.name}
              spellCheck={false}
              onChange={(event) => update(field.id, { name: event.target.value })}
            />
            <select
              aria-label="Generator type"
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
              title="Remove field"
              aria-label={`Remove ${field.name}`}
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
          {problem}
        </span>
      )}
      {state === 'loading' && <span className="inline-note">Loading generator types…</span>}
      {state === 'offline' && (
        <span className="inline-note warning">Showing starter types; the API catalog could not be reached.</span>
      )}
    </div>
  );
}
