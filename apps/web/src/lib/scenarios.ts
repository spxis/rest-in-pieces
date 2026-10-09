import type { PhraseKey } from '../i18n/phrases.ts';
import type { PlaygroundConfig } from './config.ts';

export interface Scenario {
  id: string;
  label: PhraseKey;
  hint: PhraseKey;
  apply(config: PlaygroundConfig): Partial<PlaygroundConfig>;
}

const reset = { delay: '', trickle: 0, status: 0, failRate: 0 };
const END_OF_RESULTS_MAX = 25;

/** The page that reaches the end of a capped dataset. A page number can only land on a whole page. */
function lastPageOffset({ limit, paging }: PlaygroundConfig): number {
  const size = Math.max(1, limit);
  if (paging === 'page') return Math.floor((END_OF_RESULTS_MAX - 1) / size) * size;
  return Math.max(0, END_OF_RESULTS_MAX - size);
}

/** One-click setups for the states a client has to handle. */
export const SCENARIOS: Scenario[] = [
  {
    id: 'next-page',
    label: 'scenario.nextPage.label',
    hint: 'scenario.nextPage.hint',
    apply: (c) => ({ ...reset, offset: c.offset + c.limit }),
  },
  {
    id: 'end-of-results',
    label: 'scenario.endOfResults.label',
    hint: 'scenario.endOfResults.hint',
    apply: (c) => ({ ...reset, max: END_OF_RESULTS_MAX, offset: lastPageOffset(c) }),
  },
  {
    id: 'empty',
    label: 'scenario.empty.label',
    hint: 'scenario.empty.hint',
    apply: () => ({ ...reset, offset: 0, q: 'zzz-no-match' }),
  },
  {
    id: 'slow-response',
    label: 'scenario.slowResponse.label',
    hint: 'scenario.slowResponse.hint',
    apply: () => ({ ...reset, delay: '1500' }),
  },
  {
    id: 'slow-body',
    label: 'scenario.slowBody.label',
    hint: 'scenario.slowBody.hint',
    apply: () => ({ ...reset, trickle: 250 }),
  },
  {
    id: 'rate-limited',
    label: 'scenario.rateLimited.label',
    hint: 'scenario.rateLimited.hint',
    apply: () => ({ ...reset, status: 429 }),
  },
  {
    id: 'service-unavailable',
    label: 'scenario.serviceUnavailable.label',
    hint: 'scenario.serviceUnavailable.hint',
    apply: () => ({ ...reset, status: 503 }),
  },
  {
    id: 'flaky',
    label: 'scenario.flaky.label',
    hint: 'scenario.flaky.hint',
    apply: () => ({ ...reset, failRate: 0.3 }),
  },
  {
    id: 'reset',
    label: 'scenario.reset.label',
    hint: 'scenario.reset.hint',
    apply: () => ({ ...reset, offset: 0, max: 1000, q: '', filters: [] }),
  },
];
