import { ArrowUpDown, Filter as FilterIcon, Plus, Search, Trash2 } from 'lucide-react';
import { type Filter, type FilterOperator, OPERATORS, type PlaygroundConfig } from '../lib/config.ts';

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

export function PageAndSort({
  config,
  fields,
  seeded,
  onChange,
}: {
  config: PlaygroundConfig;
  fields: string[];
  seeded: boolean;
  onChange: Update;
}) {
  return (
    <div className="form-section">
      <div className="section-label-row">
        <span className="section-caption">PAGE &amp; SORT</span>
        <ArrowUpDown size={15} />
      </div>
      <div className="input-grid three-cols">
        <NumberControl
          label="Limit"
          value={config.limit}
          min={0}
          max={1000}
          onChange={(limit) => onChange({ limit })}
        />
        <NumberControl
          label="Offset"
          value={config.offset}
          min={0}
          max={1000}
          onChange={(offset) => onChange({ offset })}
        />
        <NumberControl
          label="Dataset max"
          value={config.max}
          min={0}
          max={1000}
          onChange={(max) => onChange({ max })}
        />
      </div>
      <div className="input-grid sort-grid">
        <label className="control">
          <span>Sort field</span>
          <select value={config.sortBy} onChange={(event) => onChange({ sortBy: event.target.value })}>
            <option value="">Default order</option>
            {fields.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>Compare as</span>
          <select
            value={config.sortType}
            onChange={(event) => onChange({ sortType: event.target.value as PlaygroundConfig['sortType'] })}
          >
            <option value="string">Text</option>
            <option value="numeric">Number</option>
          </select>
        </label>
        <label className="control">
          <span>Direction</span>
          <select
            value={config.sortDirection}
            onChange={(event) => onChange({ sortDirection: event.target.value as PlaygroundConfig['sortDirection'] })}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>
      <div className="seed-row">
        {seeded && (
          <label className="control seed-control">
            <span>Seed</span>
            <input
              type="number"
              min="0"
              max="4294967295"
              value={config.seed}
              onChange={(event) => onChange({ seed: Math.max(0, Math.trunc(Number(event.target.value)) || 0) })}
            />
            <span className="control-hint">Same seed, same dataset</span>
          </label>
        )}
        <label className="check-control">
          <input
            type="checkbox"
            checked={config.metadata}
            onChange={(event) => onChange({ metadata: event.target.checked })}
          />
          <span>Include response metadata</span>
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
  const update = (id: number, patch: Partial<Filter>) =>
    onChange({ filters: config.filters.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter)) });
  const add = () => {
    const id = Math.max(0, ...config.filters.map((filter) => filter.id)) + 1;
    onChange({ filters: [...config.filters, { id, field: fields[1] ?? fields[0] ?? '', operator: 'eq', value: '' }] });
  };

  return (
    <div className="form-section">
      <div className="section-label-row">
        <span className="section-caption">SEARCH &amp; FILTER</span>
        <FilterIcon size={15} />
      </div>
      <label className="control search-control">
        <span className="sr-only">Search</span>
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search every field…"
          value={config.q}
          onChange={(event) => onChange({ q: event.target.value })}
        />
      </label>
      <div className="field-list">
        {config.filters.map((filter) => (
          <div className="field-row filter-row" key={filter.id}>
            <select
              aria-label="Filter field"
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
              aria-label="Operator"
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
              aria-label="Filter value"
              placeholder={filter.operator === 'eq' ? 'a,b matches either' : 'value'}
              value={filter.value}
              onChange={(event) => update(filter.id, { value: event.target.value })}
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Remove filter"
              title="Remove filter"
              onClick={() => onChange({ filters: config.filters.filter((item) => item.id !== filter.id) })}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="small-command add-filter" onClick={add} disabled={config.filters.length >= 20}>
        <Plus size={14} /> Add filter
      </button>
    </div>
  );
}
