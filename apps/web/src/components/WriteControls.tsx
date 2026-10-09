import { PencilLine, RotateCcw } from 'lucide-react';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import { type HttpMethod, type PlaygroundConfig, takesBody, takesId } from '../lib/config.ts';
import { isJson } from '../lib/samples.ts';

type Update = (patch: Partial<PlaygroundConfig>) => void;

/** The method switch in the builder's title bar. A dataset that takes only GET shows it as a plain tag. */
export function MethodPicker({
  methods,
  value,
  onChange,
}: {
  methods: readonly HttpMethod[];
  value: HttpMethod;
  onChange: (method: HttpMethod) => void;
}) {
  const { say } = useSpeaker();
  if (methods.length < 2) return <span className="method-tag">{value}</span>;
  return (
    <fieldset className="method-picker">
      <legend className="sr-only">{say('method.label')}</legend>
      {methods.map((method) => (
        <button
          type="button"
          key={method}
          className={value === method ? 'method-option active' : 'method-option'}
          aria-pressed={value === method}
          onClick={() => onChange(method)}
        >
          {method}
        </button>
      ))}
    </fieldset>
  );
}

/** The record, body and conflict switch of a write, in place of the read controls. */
export function WriteRequest({
  config,
  idField,
  onChange,
  onResetBody,
  kept = false,
}: {
  config: PlaygroundConfig;
  /** Whether the API keeps writes, which changes what the note under the heading says. */
  kept?: boolean;
  /** The field the record id matches, e.g. `index` for people. */
  idField: string;
  onChange: Update;
  onResetBody: () => void;
}) {
  const { say } = useSpeaker();
  const invalid = takesBody(config.method) && !isJson(config.body);
  return (
    <div className="form-section write-section">
      <div className="section-label-row">
        <span className="section-caption">{say('write.heading')}</span>
        <PencilLine size={15} />
      </div>
      <p className="inline-note">{say(kept ? 'write.kept' : 'write.stateless')}</p>
      {takesId(config.method) && (
        <label className="control record-control">
          <span>{say('write.recordId', { field: idField })}</span>
          <input
            value={config.recordId}
            spellCheck={false}
            onChange={(event) => onChange({ recordId: event.target.value.replace(/[^\w-]/g, '').slice(0, 40) })}
          />
        </label>
      )}
      {takesBody(config.method) && (
        <div className="control body-control">
          <div className="body-label">
            <label htmlFor="write-body">{say('write.body')}</label>
            <button type="button" className="small-command" onClick={onResetBody}>
              <RotateCcw size={12} /> {say('write.sample')}
            </button>
          </div>
          <textarea
            id="write-body"
            value={config.body}
            rows={10}
            spellCheck={false}
            aria-invalid={invalid || undefined}
            onChange={(event) => onChange({ body: event.target.value })}
          />
          {invalid && <span className="inline-note warning">{say('write.invalidJson')}</span>}
        </div>
      )}
      <label className="check-control">
        <input
          type="checkbox"
          checked={config.conflict}
          onChange={(event) => onChange({ conflict: event.target.checked })}
        />
        <span>{say('write.conflict')}</span>
      </label>
    </div>
  );
}
