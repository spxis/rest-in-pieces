import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import type { PlaygroundConfig } from '../lib/config.ts';
import { SCENARIOS } from '../lib/scenarios.ts';

export function ScenarioPresets({
  config,
  onApply,
}: {
  config: PlaygroundConfig;
  onApply: (patch: Partial<PlaygroundConfig>) => void;
}) {
  const { say } = useSpeaker();
  return (
    <section className="scenario-presets" aria-labelledby="scenario-heading">
      <span className="section-caption" id="scenario-heading">
        {say('scenario.heading')}
      </span>
      <div className="scenario-buttons">
        {SCENARIOS.map((scenario) => (
          <button
            type="button"
            key={scenario.id}
            onClick={() => onApply(scenario.apply(config))}
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
