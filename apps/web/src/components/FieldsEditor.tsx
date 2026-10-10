import { Plus, Trash2 } from 'lucide-react';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import type { PhraseKey } from '../i18n/phrases.ts';
import { type Field, MAX_FIELDS, SAMPLE_SCHEMA } from '../lib/config.ts';
import { schemaBody } from '../lib/request.ts';

/** The type a derived field's select shows: its type is `=` and the expression. */
export const DERIVED = '=';
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

/** A type expression as its generator and the rest: `number.int(18,65)?blank=10` is `number.int` and `(18,65)?blank=10`. */
export function splitType(type: string): { base: string; rest: string } {
  // A derived field is `=` and an expression over the other fields.
  if (type.trim().startsWith('=')) return { base: DERIVED, rest: type.trim().slice(1) };
  const base = /^[A-Za-z]\w*(?:\.[A-Za-z]\w*)?/.exec(type.trim())?.[0] ?? '';
  return { base, rest: type.trim().slice(base.length) };
}

/** The schema half of the Generate tab: whether it is on, what was typed, and how to change it. */
export interface SchemaSetup {
  on: boolean;
  text: string;
  component: string;
  /** Dataset size and seed, which the body carries. */
  max: number;
  seed: number;
  onMode: (on: boolean) => void;
  onText: (text: string) => void;
  onComponent: (component: string) => void;
}

/** Whether a typed schema can be sent: a JSON object. */
export const schemaProblem = (setup: Pick<SchemaSetup, 'text' | 'component' | 'max' | 'seed'>): boolean =>
  schemaBody({ schema: setup.text, component: setup.component, max: setup.max, seed: setup.seed }) === '';

function SchemaEditor({ setup }: { setup: SchemaSetup }) {
  const { say } = useSpeaker();
  const invalid = schemaProblem(setup);
  const isDocument = /"(openapi|swagger)"\s*:/.test(setup.text);
  return (
    <>
      <div className="control body-control">
        <div className="body-label">
          <label htmlFor="schema-text">{say('schema.label')}</label>
          <button type="button" className="small-command" onClick={() => setup.onText(SAMPLE_SCHEMA)}>
            {say('write.sample')}
          </button>
        </div>
        <textarea
          id="schema-text"
          value={setup.text}
          rows={12}
          spellCheck={false}
          aria-invalid={invalid || undefined}
          onChange={(event) => setup.onText(event.target.value)}
        />
        {invalid && (
          <span className="inline-note warning" role="alert">
            {say('schema.invalid')}
          </span>
        )}
      </div>
      {isDocument && (
        <label className="control constraints-control">
          <span>{say('schema.component')}</span>
          <input
            className="mono-input"
            value={setup.component}
            spellCheck={false}
            onChange={(event) => setup.onComponent(event.target.value)}
          />
        </label>
      )}
      <span className="inline-note">{say('schema.note')}</span>
    </>
  );
}

export function FieldsEditor({
  fields,
  generators,
  parameters = {},
  state,
  constraints = '',
  schema = null,
  onChange,
  onConstraints,
}: {
  fields: Field[];
  generators: Record<string, string[]>;
  /** Each type that takes arguments, with them in order, from `GET /generators`. */
  parameters?: Record<string, string>;
  state: 'loading' | 'ready' | 'offline';
  /** Rules between two fields, comma-separated. */
  constraints?: string;
  /** Generating from a schema instead of a field list: its text and component, and how to change them. */
  schema?: SchemaSetup | null;
  onChange: (fields: Field[]) => void;
  onConstraints?: (constraints: string) => void;
}) {
  const { say } = useSpeaker();
  const update = (id: number, patch: Partial<Field>) =>
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  const add = () => {
    const id = Math.max(0, ...fields.map((field) => field.id)) + 1;
    onChange([...fields, { id, name: `field${id}`, type: 'lorem.word' }]);
  };
  const problem = fieldProblem(fields);
  // Types that work only with arguments (`date.between`) are listed under their module too, and `pick` on its own.
  const modules: Record<string, string[]> = { ...generators };
  for (const type of Object.keys(parameters)) {
    const [module, method] = type.split('.');
    if (!module || !method || modules[module]?.includes(method)) continue;
    modules[module] = [...(modules[module] ?? []), method].sort();
  }
  const known = new Set([
    'pick',
    DERIVED,
    ...Object.entries(modules).flatMap(([module, methods]) => methods.map((m) => `${module}.${m}`)),
  ]);

  return (
    <div className="form-section fields-section">
      <div className="field-heading">
        <div>
          <span className="section-caption">{say('fields.heading')}</span>
          {!schema?.on && (
            <span className="field-count">
              {fields.length} / {MAX_FIELDS}
            </span>
          )}
        </div>
        {!schema?.on && (
          <button type="button" className="small-command" onClick={add} disabled={fields.length >= MAX_FIELDS}>
            <Plus size={14} /> {say('fields.add')}
          </button>
        )}
      </div>
      {schema && (
        <fieldset className="method-picker schema-mode">
          <legend className="sr-only">{say('schema.mode')}</legend>
          {([false, true] as const).map((on) => (
            <button
              type="button"
              key={String(on)}
              className={schema.on === on ? 'method-option active' : 'method-option'}
              aria-pressed={schema.on === on}
              onClick={() => schema.onMode(on)}
            >
              {say(on ? 'schema.modeSchema' : 'schema.modeFields')}
            </button>
          ))}
        </fieldset>
      )}
      {schema?.on && <SchemaEditor setup={schema} />}
      <div className="field-list" hidden={schema?.on} style={schema?.on ? { display: 'none' } : undefined}>
        {fields.map((field) => (
          <div className="field-row" key={field.id}>
            <input
              aria-label={say('fields.name')}
              value={field.name}
              spellCheck={false}
              onChange={(event) => update(field.id, { name: event.target.value })}
            />
            {(() => {
              const { base, rest } = splitType(field.type);
              const derived = base === DERIVED;
              const takes = parameters[base];
              return (
                <>
                  <select
                    aria-label={say('fields.type')}
                    value={base}
                    onChange={(event) =>
                      update(field.id, { type: event.target.value === DERIVED ? '=index + 1' : event.target.value })
                    }
                  >
                    {!known.has(base) && <option value={base}>{base}</option>}
                    <optgroup label={say('fields.derivedGroup')}>
                      <option value={DERIVED}>{say('fields.derived')}</option>
                    </optgroup>
                    {Object.keys(parameters).includes('pick') && (
                      <optgroup label="pick">
                        <option value="pick">pick</option>
                      </optgroup>
                    )}
                    {Object.entries(modules).map(([module, methods]) => (
                      <optgroup label={module} key={module}>
                        {methods.map((method) => (
                          <option key={method} value={`${module}.${method}`}>
                            {module}.{method}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <input
                    className="field-args"
                    aria-label={derived ? say('fields.expression') : say('fields.args')}
                    title={
                      derived
                        ? say('fields.expressionHint')
                        : takes
                          ? say('fields.takes', { type: base, args: takes })
                          : say('fields.syntax')
                    }
                    placeholder={derived ? "age(born), concat(first, ' ', last)" : takes ? `(${takes})` : '?blank=15'}
                    value={rest}
                    spellCheck={false}
                    onChange={(event) =>
                      update(field.id, { type: `${derived ? '=' : base}${event.target.value.trim()}` })
                    }
                  />
                </>
              );
            })()}
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
      {onConstraints && !schema?.on && (
        <label className="control constraints-control">
          <span>{say('fields.constraints')}</span>
          <input
            className="mono-input"
            aria-label={say('fields.constraints')}
            title={say('fields.constraintsHint')}
            placeholder="end>start, total>=subtotal"
            value={constraints}
            spellCheck={false}
            onChange={(event) => onConstraints(event.target.value)}
          />
        </label>
      )}
      {!schema?.on && <span className="inline-note">{say('fields.syntax')}</span>}
      {!schema?.on && <span className="inline-note">{say('fields.expressions')}</span>}
      {state === 'loading' && <span className="inline-note">{say('fields.loading')}</span>}
      {state === 'offline' && <span className="inline-note warning">{say('fields.offline')}</span>}
    </div>
  );
}
