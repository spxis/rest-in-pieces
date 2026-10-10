import { Network } from 'lucide-react';
import type { ResourceInfo } from '../hooks/useCatalog.ts';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import { MAX_EXPAND_PATHS, type PlaygroundConfig } from '../lib/config.ts';

type Update = (patch: Partial<PlaygroundConfig>) => void;

/** A record that has the lists under it, for a dataset whose ids are codes and not numbers. */
const SAMPLE_PARENT: Readonly<Record<string, string>> = {
  withdrawn: 'SU',
};

/**
 * Relations: a list under one record (`/users/7/orders`) and the records to embed with `expand=`. Shown for a
 * dataset that has either; the embeddable relations are the listed dataset's own.
 */
export function RelationsControls({
  config,
  resource,
  target,
  onChange,
}: {
  config: PlaygroundConfig;
  /** The dataset the tab names. */
  resource: ResourceInfo | undefined;
  /** What is listed: the nested dataset, or the dataset itself. */
  target: ResourceInfo | undefined;
  onChange: Update;
}) {
  const { say } = useSpeaker();
  const nested = resource?.nested ?? [];
  const expandable = target?.expand ?? [];
  if (nested.length === 0 && expandable.length === 0) return null;
  const toggle = (path: string) =>
    onChange({
      expand: config.expand.includes(path)
        ? config.expand.filter((item) => item !== path)
        : [...config.expand, path].slice(0, MAX_EXPAND_PATHS),
    });

  return (
    <div className="form-section relations-section" data-testid="relations">
      <div className="section-label-row">
        <span className="section-caption">{say('relations.heading')}</span>
        <Network size={15} />
      </div>
      {nested.length > 0 && (
        <div className="input-grid relations-grid">
          <label className="control">
            <span>{say('relations.nested')}</span>
            <select
              value={config.nested}
              // Embeds belong to the dataset being listed, so a new list starts with none.
              onChange={(event) =>
                onChange({
                  nested: event.target.value,
                  expand: [],
                  sortBy: '',
                  filters: [],
                  ...(event.target.value && SAMPLE_PARENT[config.endpoint]
                    ? { parentId: SAMPLE_PARENT[config.endpoint] }
                    : {}),
                })
              }
            >
              <option value="">
                /{config.endpoint} · {say('relations.whole')}
              </option>
              {nested.map((name) => (
                <option key={name} value={name}>
                  /{config.endpoint}/{'{id}'}/{name}
                </option>
              ))}
            </select>
          </label>
          {config.nested && (
            <label className="control">
              <span>{say('relations.parent')}</span>
              <input
                value={config.parentId}
                spellCheck={false}
                onChange={(event) => onChange({ parentId: event.target.value.replace(/[^\w-]/g, '').slice(0, 40) })}
              />
            </label>
          )}
        </div>
      )}
      {expandable.length > 0 && (
        <fieldset className="expand-fieldset">
          <legend>{say('relations.expand')}</legend>
          <div className="expand-options">
            {expandable.map((path) => (
              <button
                type="button"
                key={path}
                className={config.expand.includes(path) ? 'format-option active' : 'format-option'}
                aria-pressed={config.expand.includes(path)}
                onClick={() => toggle(path)}
              >
                {path}
              </button>
            ))}
          </div>
          <span className="inline-note">{say('relations.expandHint')}</span>
        </fieldset>
      )}
    </div>
  );
}
