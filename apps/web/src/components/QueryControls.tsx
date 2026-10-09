import { ArrowUpDown, Filter as FilterIcon, Plus, Search, Trash2 } from 'lucide-react';
import type { DataLocaleInfo } from '../hooks/useCatalog.ts';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import type { Speaker } from '../i18n/speaker.ts';
import { type Filter, type FilterOperator, OPERATORS, PAGING_STYLES, type PlaygroundConfig } from '../lib/config.ts';

type Update = (patch: Partial<PlaygroundConfig>) => void;

function NumberControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="control">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Math.trunc(Number(event.target.value));
          onChange(Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : min);
        }}
      />
    </label>
  );
}

/**
 * A data locale's name in the playground's language: the API's English name, or the runtime's own name for the
 * locale's tag in Japanese (`ドイツ語 (ドイツ)`). The mix has no tag, so it has a phrase of its own.
 */
export function dataLocaleLabel(locale: DataLocaleInfo, { locale: ui, say }: Speaker): string {
  if (locale.tag === null) return say('data.localeGlobal');
  if (ui === 'en') return locale.name;
  try {
    return new Intl.DisplayNames([ui], { type: 'language', languageDisplay: 'standard' }).of(locale.tag) ?? locale.name;
  } catch {
    return locale.name;
  }
}

export function PageAndSort({
  config,
  fields,
  seeded,
  locales,
  onChange,
}: {
  config: PlaygroundConfig;
  fields: string[];
  seeded: boolean;
  /** From `GET /locales`. */
  locales: DataLocaleInfo[];
  onChange: Update;
}) {
  const speaker = useSpeaker();
  const { say } = speaker;
  const byPage = config.paging === 'page';
  const pageNumber = config.limit > 0 ? Math.floor(config.offset / config.limit) + 1 : 1;
  // A shared link may name a locale this API does not list; it stays selectable rather than silently changing.
  const options = locales.map((locale) => ({ code: locale.code, label: dataLocaleLabel(locale, speaker) }));
  if (!options.some((option) => option.code === config.locale)) {
    options.push({ code: config.locale, label: config.locale });
  }
  return (
    <div className="form-section">
      <div className="section-label-row">
        <span className="section-caption">{say('page.heading')}</span>
        <ArrowUpDown size={15} />
      </div>
      <div className="input-grid four-cols">
        <label className="control">
          <span>{say('page.style')}</span>
          <select
            value={config.paging}
            onChange={(event) => onChange({ paging: event.target.value as PlaygroundConfig['paging'] })}
          >
            {PAGING_STYLES.map((style) => (
              <option key={style.value} value={style.value}>
                {say(style.label)}
              </option>
            ))}
          </select>
        </label>
        <NumberControl
          label={say(byPage ? 'page.size' : 'page.limit')}
          value={config.limit}
          min={0}
          max={1000}
          onChange={(limit) => onChange({ limit })}
        />
        {byPage ? (
          <NumberControl
            label={say('page.number')}
            value={pageNumber}
            min={1}
            max={1001}
            onChange={(page) => onChange({ offset: Math.min(1000, (page - 1) * config.limit) })}
          />
        ) : (
          <NumberControl
            label={say('page.offset')}
            value={config.offset}
            min={0}
            max={1000}
            onChange={(offset) => onChange({ offset })}
          />
        )}
        <NumberControl
          label={say('page.max')}
          value={config.max}
          min={0}
          max={1000}
          onChange={(max) => onChange({ max })}
        />
      </div>
      <div className="input-grid sort-grid">
        <label className="control">
          <span>{say('sort.field')}</span>
          <select value={config.sortBy} onChange={(event) => onChange({ sortBy: event.target.value })}>
            <option value="">{say('sort.default')}</option>
            {fields.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>{say('sort.compareAs')}</span>
          <select
            value={config.sortType}
            onChange={(event) => onChange({ sortType: event.target.value as PlaygroundConfig['sortType'] })}
          >
            <option value="string">{say('sort.text')}</option>
            <option value="numeric">{say('sort.number')}</option>
          </select>
        </label>
        <label className="control">
          <span>{say('sort.direction')}</span>
          <select
            value={config.sortDirection}
            onChange={(event) => onChange({ sortDirection: event.target.value as PlaygroundConfig['sortDirection'] })}
          >
            <option value="asc">{say('sort.asc')}</option>
            <option value="desc">{say('sort.desc')}</option>
          </select>
        </label>
      </div>
      <div className="seed-row">
        {seeded && (
          <label className="control seed-control">
            <span>{say('seed.label')}</span>
            <input
              type="number"
              min="0"
              max="4294967295"
              value={config.seed}
              onChange={(event) => onChange({ seed: Math.max(0, Math.trunc(Number(event.target.value)) || 0) })}
            />
            <span className="control-hint">{say('seed.hint')}</span>
          </label>
        )}
        <label className="control locale-control">
          <span>{say('data.locale')}</span>
          <select
            value={config.locale}
            onChange={(event) => onChange({ locale: event.target.value as PlaygroundConfig['locale'] })}
          >
            {options.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={config.metadata}
            onChange={(event) => onChange({ metadata: event.target.checked })}
          />
          <span>{say('metadata.include')}</span>
        </label>
        <label className="check-control" title={say('data.safeHint')}>
          <input type="checkbox" checked={config.safe} onChange={(event) => onChange({ safe: event.target.checked })} />
          <span>{say('data.safe')}</span>
        </label>
      </div>
    </div>
  );
}

export function SearchAndFilters({
  config,
  fields,
  onChange,
}: {
  config: PlaygroundConfig;
  fields: string[];
  onChange: Update;
}) {
  const { say } = useSpeaker();
  const update = (id: number, patch: Partial<Filter>) =>
    onChange({ filters: config.filters.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter)) });
  const add = () => {
    const id = Math.max(0, ...config.filters.map((filter) => filter.id)) + 1;
    onChange({ filters: [...config.filters, { id, field: fields[1] ?? fields[0] ?? '', operator: 'eq', value: '' }] });
  };

  return (
    <div className="form-section">
      <div className="section-label-row">
        <span className="section-caption">{say('search.heading')}</span>
        <FilterIcon size={15} />
      </div>
      <label className="control search-control">
        <span className="sr-only">{say('search.label')}</span>
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          placeholder={say('search.placeholder')}
          value={config.q}
          onChange={(event) => onChange({ q: event.target.value })}
        />
      </label>
      <div className="field-list">
        {config.filters.map((filter) => (
          <div className="field-row filter-row" key={filter.id}>
            <select
              aria-label={say('filter.field')}
              value={filter.field}
              onChange={(event) => update(filter.id, { field: event.target.value })}
            >
              {fields.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label={say('filter.operator')}
              value={filter.operator}
              onChange={(event) => update(filter.id, { operator: event.target.value as FilterOperator })}
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            <input
              aria-label={say('filter.value')}
              placeholder={say(filter.operator === 'eq' ? 'filter.eitherHint' : 'filter.valueHint')}
              value={filter.value}
              onChange={(event) => update(filter.id, { value: event.target.value })}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={say('filter.remove')}
              title={say('filter.remove')}
              onClick={() => onChange({ filters: config.filters.filter((item) => item.id !== filter.id) })}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="small-command add-filter" onClick={add} disabled={config.filters.length >= 20}>
        <Plus size={14} /> {say('filter.add')}
      </button>
    </div>
  );
}
