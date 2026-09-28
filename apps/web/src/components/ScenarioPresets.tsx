import type { PlaygroundConfig } from '../lib/config.ts';
import { SCENARIOS } from '../lib/scenarios.ts';

export function ScenarioPresets({
  config,
  onApply,
}: {
  config: PlaygroundConfig;
  onApply: (patch: Partial<PlaygroundConfig>) => void;
}) {
  return (
    <section className="scenario-presets" aria-labelledby="scenario-heading">
      <span className="section-caption" id="scenario-heading">
        REPEATABLE SCENARIOS
      </span>
      <div className="scenario-buttons">
        {SCENARIOS.map((scenario) => (
          <button type="button" key={scenario.id} onClick={() => onApply(scenario.apply(config))} title={scenario.hint}>
            {scenario.label}
            <small className="scenario-hint">{scenario.hint}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
