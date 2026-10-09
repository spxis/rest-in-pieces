import { useCallback, useEffect, useState } from 'react';
import { inBrowserSession, isInBrowserApi, setInBrowserSession } from '../lib/inBrowserApi.ts';
import { trimBase } from '../lib/request.ts';

export interface SessionDataset {
  dataset: string;
  seed: number;
  locale: string;
  records: number;
  created: number;
  updated: number;
  deleted: number;
  lastWrite: string;
}

export interface SessionSummary {
  enabled: boolean;
  limits: { records: number; datasets: number; bytes: number };
  usage: { datasets: number; bytes: number };
  datasets: SessionDataset[];
}

export interface SessionState {
  /** What `GET /session` answered; null before it has, and for an API that predates sessions. */
  summary: SessionSummary | null;
  /** `loading`, `ready`, `unsupported` (no `/session`) or `offline`. */
  state: 'loading' | 'ready' | 'unsupported' | 'offline';
  /** Whether the session can be switched here: only the API inside this tab can be. */
  switchable: boolean;
  /** Whether keeping is switched on for the API inside this tab, as soon as it is pressed. */
  keepInTab: boolean;
  reload(): Promise<void>;
  reset(): Promise<void>;
  /** Turns keeping writes on or off for the API inside this tab. */
  setKeep(on: boolean): Promise<void>;
}

/** Reads the API's session, and resets it. Nothing here runs on a timer: it reads when asked to. */
export function useSession(apiBase: string): SessionState {
  const base = trimBase(apiBase);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [state, setState] = useState<SessionState['state']>('loading');
  const switchable = isInBrowserApi(apiBase);
  const [keepInTab, setKeepInTab] = useState(inBrowserSession);

  const load = useCallback(
    async (path = '/session', init: RequestInit = {}) => {
      try {
        const response = await fetch(`${base}${path}`, init);
        if (response.status === 404) {
          setSummary(null);
          setState('unsupported');
          return;
        }
        const body = (await response.json()) as SessionSummary;
        setSummary(body);
        setState('ready');
      } catch {
        setSummary(null);
        setState('offline');
      }
    },
    [base],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return {
    summary,
    state,
    switchable,
    keepInTab,
    reload: () => load(),
    reset: () => load('/reset', { method: 'POST' }),
    setKeep: async (on) => {
      if (!switchable || inBrowserSession() === on) return;
      setKeepInTab(on);
      setInBrowserSession(on);
      await load();
    },
  };
}
