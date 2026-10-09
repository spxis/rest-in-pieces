import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import type { PhraseKey } from '../i18n/phrases.ts';
import { FORMATS, MAX_DELAY_MS, MESSY_SHARES, normalizeDelay, type PlaygroundConfig } from '../lib/config.ts';

type Update = (patch: Partial<PlaygroundConfig>) => void;

export function FormatPicker({ value, onChange }: { value: PlaygroundConfig['format']; onChange: Update }) {
  const { say } = useSpeaker();
  return (
    <div className="form-section output-section">
      <div className="section-label-row">
        <span className="section-caption">{say('format.heading')}</span>
        <span>{say('format.negotiation')}</span>
      </div>
      <fieldset className="format-fieldset">
        <legend className="sr-only">{say('format.legend')}</legend>
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

// HTTP reason phrases are left in English in every language, the way developers read them in logs.
const STATUSES = [
  [0, null],
  [400, '400 Bad Request'],
  [401, '401 Unauthorized'],
  [404, '404 Not Found'],
  [422, '422 Unprocessable'],
  [429, '429 Too Many Requests'],
  [500, '500 Internal Server Error'],
  [503, '503 Service Unavailable'],
] as const;

const FAIL_RATES = [0, 0.1, 0.3, 0.5, 1] as const;

const failLabel = (rate: number): [PhraseKey, { percent: number }] =>
  rate === 0
    ? ['simulate.never', { percent: 0 }]
    : rate === 1
      ? ['simulate.always', { percent: 100 }]
      : ['simulate.share', { percent: rate * 100 }];

export function SimulationPanel({ config, onChange }: { config: PlaygroundConfig; onChange: Update }) {
  const { say } = useSpeaker();
  const delay = normalizeDelay(config.delay);
  const active = !!delay || config.trickle > 0 || config.status > 0 || config.failRate > 0 || config.messy > 0;
  return (
    <details className="simulation-details" open={active || undefined}>
      <summary>
        {say('simulate.heading')} <span>{say(active ? 'simulate.active' : 'simulate.optional')}</span>
      </summary>
      <div className="simulation-grid">
        <label className="control">
          <span>{say('simulate.delay')}</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder={say('simulate.delayHint')}
            title={say('simulate.delayHint')}
            aria-invalid={delay === null || undefined}
            value={config.delay}
            onChange={(event) => onChange({ delay: event.target.value })}
          />
        </label>
        <label className="control">
          <span>{say('simulate.status')}</span>
          <select value={config.status} onChange={(event) => onChange({ status: Number(event.target.value) })}>
            {STATUSES.map(([code, label]) => (
              <option key={code} value={code}>
                {label ?? say('simulate.none')}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>{say('simulate.trickle')}</span>
          <input
            type="number"
            min="0"
            max={MAX_DELAY_MS}
            step="50"
            value={config.trickle}
            onChange={(event) =>
              onChange({ trickle: Math.min(MAX_DELAY_MS, Math.max(0, Math.round(Number(event.target.value)) || 0)) })
            }
          />
        </label>
        <label className="control">
          <span>{say('simulate.failures')}</span>
          <select
            value={config.failRate}
            disabled={config.status > 0}
            onChange={(event) => onChange({ failRate: Number(event.target.value) })}
          >
            {FAIL_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {say(...failLabel(rate))}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>{say('simulate.messy')}</span>
          <select value={config.messy} onChange={(event) => onChange({ messy: Number(event.target.value) })}>
            {MESSY_SHARES.map((share) => (
              <option key={share} value={share}>
                {share === 0 ? say('simulate.none') : say('simulate.messyShare', { percent: Math.round(share * 100) })}
              </option>
            ))}
          </select>
        </label>
      </div>
    </details>
  );
}
