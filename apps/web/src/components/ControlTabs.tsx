import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';

export interface ControlTab {
  id: string;
  /** The tab's name. */
  label: string;
  /** A few words under the name on the tab: what is switched on in it, or that it is optional. */
  status: string;
  /** Whether something in it is switched on, so the tab shows it while another is open. */
  active: boolean;
  panel: ReactNode;
}

/**
 * The rehearsal controls (simulate a response, sign in, keep writes) as tabs: one open at a time, so the column is one
 * panel tall, not three folds stacked below the fields. Arrow keys, Home and End move between the tabs.
 */
export function ControlTabs({ tabs }: { tabs: readonly ControlTab[] }) {
  const { say } = useSpeaker();
  const base = useId();
  const [chosen, setChosen] = useState(tabs[0]?.id ?? '');
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const current = tabs.find((tab) => tab.id === chosen) ?? tabs[0];
  if (!current) return null;

  const move = (event: KeyboardEvent, from: number) => {
    const last = tabs.length - 1;
    const to =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (from + 1) % tabs.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (from + last) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    const next = tabs[to];
    if (!next) return;
    event.preventDefault();
    setChosen(next.id);
    buttons.current.get(next.id)?.focus();
  };

  return (
    <div className="control-tabs" data-testid="control-tabs">
      <div className="control-tab-row" role="tablist" aria-label={say('controls.tabs')}>
        {tabs.map((tab, at) => (
          <button
            type="button"
            key={tab.id}
            role="tab"
            id={`${base}-${tab.id}-tab`}
            aria-selected={tab.id === current.id}
            aria-controls={`${base}-${tab.id}-panel`}
            tabIndex={tab.id === current.id ? 0 : -1}
            className={['control-tab', tab.id === current.id ? 'selected' : '', tab.active ? 'on' : '']
              .filter(Boolean)
              .join(' ')}
            data-testid={`${tab.id}-tab`}
            ref={(node) => {
              if (node) buttons.current.set(tab.id, node);
              else buttons.current.delete(tab.id);
            }}
            onClick={() => setChosen(tab.id)}
            onKeyDown={(event) => move(event, at)}
          >
            <b className="control-tab-name">{tab.label}</b>
            <span className="control-tab-status">{tab.status}</span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-${current.id}-panel`}
        aria-labelledby={`${base}-${current.id}-tab`}
        className="control-tab-panel"
      >
        {current.panel}
      </div>
    </div>
  );
}
