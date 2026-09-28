import type { PlaygroundConfig } from './config.ts';

export interface Scenario {
  id: string;
  label: string;
  hint: string;
  apply(config: PlaygroundConfig): Partial<PlaygroundConfig>;
}

const reset = { delay: 0, status: 0, failRate: 0 };

/** One-click setups for the states a client has to handle. */
export const SCENARIOS: Scenario[] = [
  {
    id: 'next-page',
    label: 'Next page',
    hint: 'offset + limit',
    apply: (c) => ({ ...reset, offset: c.offset + c.limit }),
  },
  {
    id: 'end-of-results',
    label: 'End of results',
    hint: 'last page of 25',
    apply: (c) => ({ ...reset, max: 25, offset: Math.max(0, 25 - Math.max(1, c.limit)) }),
  },
  { id: 'empty', label: 'Empty result', hint: 'no matches', apply: () => ({ ...reset, offset: 0, q: 'zzz-no-match' }) },
  { id: 'slow-response', label: 'Slow response', hint: '1.5 s delay', apply: () => ({ ...reset, delay: 1500 }) },
  { id: 'rate-limited', label: '429 error', hint: 'Retry-After', apply: () => ({ ...reset, status: 429 }) },
  { id: 'service-unavailable', label: '503 error', hint: 'server down', apply: () => ({ ...reset, status: 503 }) },
  { id: 'flaky', label: 'Flaky', hint: 'fails 30%', apply: () => ({ ...reset, failRate: 0.3 }) },
  {
    id: 'reset',
    label: 'Reset',
    hint: 'happy path',
    apply: () => ({ ...reset, offset: 0, max: 1000, q: '', filters: [] }),
  },
];
