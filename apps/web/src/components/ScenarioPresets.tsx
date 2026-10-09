import { Check, Link2 } from 'lucide-react';
import { useState } from 'react';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import { configToHash, type PlaygroundConfig } from '../lib/config.ts';
import { SCENARIOS } from '../lib/scenarios.ts';

/** The key `useCopy` remembers for the share button here, apart from the one under the request URL. */
export const SCENARIO_SHARE = 'scenario';
/** What only a simulation scenario changes. Paging and search scenarios mean nothing to a write. */
const SIMULATION = new Set<string>(['delay', 'trickle', 'status', 'failRate']);

export function ScenarioPresets({
  config,
  onApply,
  copied,
  onShare,
  simulationOnly = false,
}: {
  config: PlaygroundConfig;
  onApply: (patch: Partial<PlaygroundConfig>) => void;
  copied: string | null;
  onShare: () => void;
  /** Offer only the scenarios that change nothing but the simulated response. */
  simulationOnly?: boolean;
}) {
  const { say } = useSpeaker();
  const scenarios = simulationOnly
    ? SCENARIOS.filter((scenario) => Object.keys(scenario.apply(config)).every((key) => SIMULATION.has(key)))
    : SCENARIOS;
  // The setup a scenario button produced. While nothing has changed since, the share button offers that scenario.
  const [applied, setApplied] = useState<string | null>(null);
  const fresh = applied !== null && applied === configToHash(config);

  const apply = (patch: Partial<PlaygroundConfig>) => {
    setApplied(configToHash({ ...config, ...patch }));
    onApply(patch);
  };

  return (
    <section className="scenario-presets" aria-labelledby="scenario-heading">
      <div className="scenario-heading-row">
        <span className="section-caption" id="scenario-heading">
          {say('scenario.heading')}
        </span>
        <button
          type="button"
          className={fresh ? 'scenario-share fresh' : 'scenario-share'}
          onClick={onShare}
          title={say('scenario.shareTitle')}
        >
          {copied === SCENARIO_SHARE ? <Check size={13} /> : <Link2 size={13} />}
          {copied === SCENARIO_SHARE ? say('common.copied') : say(fresh ? 'scenario.shareThis' : 'scenario.share')}
        </button>
      </div>
      <div className="scenario-buttons">
        {scenarios.map((scenario) => (
          <button
            type="button"
            key={scenario.id}
            onClick={() => apply(scenario.apply(config))}
            title={say(scenario.hint)}
          >
            {say(scenario.label)}
            <small className="scenario-hint">{say(scenario.hint)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
