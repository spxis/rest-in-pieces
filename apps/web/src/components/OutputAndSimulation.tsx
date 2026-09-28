import { FORMATS, type PlaygroundConfig } from '../lib/config.ts';

type Update = (patch: Partial<PlaygroundConfig>) => void;

export function FormatPicker({ value, onChange }: { value: PlaygroundConfig['format']; onChange: Update }) {
  return (
    <div className="form-section output-section">
      <div className="section-label-row">
        <span className="section-caption">RESPONSE</span>
        <span>Content negotiation</span>
      </div>
      <fieldset className="format-fieldset">
        <legend className="sr-only">Response format</legend>
        <div className="format-options">
          {FORMATS.map((option) => (
            <button
              type="button"
              key={option}
              className={value === option ? 'format-option active' : 'format-option'}
              aria-pressed={value === option}
              onClick={() => onChange({ format: option })}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

const STATUSES = [
  [0, 'None'],
  [400, '400 Bad Request'],
  [401, '401 Unauthorized'],
  [404, '404 Not Found'],
  [422, '422 Unprocessable'],
  [429, '429 Too Many Requests'],
  [500, '500 Internal Server Error'],
  [503, '503 Service Unavailable'],
] as const;

const FAIL_RATES = [
  [0, 'Never'],
  [0.1, '10% of requests'],
  [0.3, '30% of requests'],
  [0.5, '50% of requests'],
  [1, 'Every request'],
] as const;

export function SimulationPanel({ config, onChange }: { config: PlaygroundConfig; onChange: Update }) {
  const active = config.delay > 0 || config.status > 0 || config.failRate > 0;
  return (
    <details className="simulation-details" open={active || undefined}>
      <summary>
        SIMULATE A RESPONSE <span>{active ? 'Active' : 'Optional'}</span>
      </summary>
      <div className="simulation-grid">
        <label className="control">
          <span>Delay (ms)</span>
          <input
            type="number"
            min="0"
            max="10000"
            step="100"
            value={config.delay}
            onChange={(event) => onChange({ delay: Math.min(10_000, Math.max(0, Number(event.target.value) || 0)) })}
          />
        </label>
        <label className="control">
          <span>Error status</span>
          <select value={config.status} onChange={(event) => onChange({ status: Number(event.target.value) })}>
            {STATUSES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>Random failures</span>
          <select
            value={config.failRate}
            disabled={config.status > 0}
            onChange={(event) => onChange({ failRate: Number(event.target.value) })}
          >
            {FAIL_RATES.map(([rate, label]) => (
              <option key={rate} value={rate}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  );
}
