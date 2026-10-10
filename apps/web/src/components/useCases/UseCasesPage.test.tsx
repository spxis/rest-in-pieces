import { createApp } from '@johnmorrisdotca/rest-in-pieces/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../i18n/LocaleProvider.tsx';
import { USE_CASES } from '../../lib/useCases.ts';
import UseCasesPage from '../UseCasesPage.tsx';
import { flagsOf } from './MessyScene.tsx';
import { BaseContext } from './scene.tsx';

const BASE = 'http://api.test';

/** The real API, answering in this process, so the animations draw what it really says. */
function realApi() {
  const app = createApp();
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    return Promise.resolve(app.fetch(new Request(`http://localhost${url.pathname}${url.search}`, init)));
  });
}

function stubMotion(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduced && query.includes('reduce'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function page(locale: 'en' | 'ja' = 'en') {
  return render(
    <LocaleProvider initial={locale}>
      <BaseContext.Provider value={BASE}>
        <UseCasesPage />
      </BaseContext.Provider>
    </LocaleProvider>,
  );
}

const done = () =>
  waitFor(
    () => {
      for (const stage of document.querySelectorAll('[data-testid^=uc-stage-]')) {
        expect(stage.getAttribute('data-state')).toBe('done');
      }
    },
    { timeout: 20_000 },
  );

describe('the use cases page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', realApi());
    stubMotion(true);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('draws eleven cases, each with a heading, a stage and copyable code', () => {
    page();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('What it is for');
    expect(screen.getAllByRole('article')).toHaveLength(11);
    for (const useCase of USE_CASES) {
      const card = screen.getByTestId(`uc-${useCase.id}`);
      expect(within(card).getByRole('heading', { level: 2 })).toBeTruthy();
      expect(within(card).getByTestId(`uc-stage-${useCase.id}`)).toBeTruthy();
      expect(within(card).getAllByRole('button', { name: /^Copy / }).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('navigation', { name: 'Jump to a use case' }).querySelectorAll('a')).toHaveLength(11);
  });

  it('plays every animation to its end from real answers when motion is reduced', async () => {
    page();
    await done();
    expect(screen.getAllByTestId('uc-person-row')).toHaveLength(5);
    expect(screen.getByTestId('uc-order').textContent).toContain('Easton Parisian');
    expect(screen.getByTestId('uc-new-id').textContent).toMatch(/^\d+$/);
    expect(screen.getByTestId('uc-dots').children).toHaveLength(10);
    expect(screen.getByTestId('uc-down').textContent).toContain('Retry-After: 1');
    expect(screen.getByTestId('uc-empty').textContent).toContain('0 results');
    expect(screen.getByTestId('uc-log').textContent).toContain('401');
    expect(screen.getByTestId('uc-same').textContent).toContain('identical');
    expect(screen.getByTestId('uc-other')).toBeTruthy();
    expect(screen.getAllByTestId('uc-terminal-block')).toHaveLength(2);
    expect(screen.getByTestId('uc-generated').querySelectorAll('tr')).toHaveLength(4);
    expect(screen.getAllByTestId('uc-locale-row')).toHaveLength(4);
    expect(screen.getByTestId('uc-adds').textContent).toContain('add up');
    expect(screen.getByTestId('uc-synthetic-tag').textContent).toBe('SYNTHETIC');
    expect(screen.getByTestId('uc-invented').textContent).toContain('Invented data');
    expect(screen.getByTestId('uc-places-country').querySelectorAll('option')).toHaveLength(8);
    expect((screen.getByTestId('uc-places-region') as HTMLSelectElement).value).toBe('CA-ON');
    expect(screen.getByTestId('uc-places-card').textContent).toContain('オンタリオ州');
  });

  it('asks the API for the requests the snippets show', async () => {
    page();
    await done();
    const fetched = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) => String(call[0]));
    expect(fetched).toContain(`${BASE}/users?limit=5&seed=7&safe=true`);
    expect(fetched).toContain(`${BASE}/orders/4?expand=user,items.product&safe=true`);
    expect(fetched).toContain(`${BASE}/names?limit=4&seed=42`);
    expect(fetched).toContain(`${BASE}/groupings/g7/countries?limit=7`);
    expect(fetched).toContain(`${BASE}/subdivisions/CA-ON`);
  });

  it('copies a snippet with one press', async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, 'writeText');
    page();
    await user.click(screen.getByTestId('uc-copy-front-end-curl'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining("curl 'http://localhost:6800/users?limit=5"));
    await waitFor(() => expect(screen.getByTestId('uc-copy-front-end-curl').textContent).toContain('Copied'));
  });

  it('says it all in Japanese too', async () => {
    page('ja');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('使いどころ');
    expect(screen.getAllByRole('button', { name: /をコピー$/ }).length).toBeGreaterThan(0);
    await done();
    expect(document.title).toBe('ユースケース · REST in Pieces');
  });

  it('says so, and stays calm, when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    page();
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBe(11), { timeout: 20_000 });
    expect(screen.getAllByRole('alert')[0]?.textContent).toContain('could not reach the API');
    for (const stage of document.querySelectorAll('[data-testid^=uc-stage-]')) {
      expect(stage.getAttribute('data-state')).toBe('error');
    }
  });

  it('replays an animation on request', async () => {
    const user = userEvent.setup();
    page();
    await done();
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    await user.click(screen.getByTestId('uc-replay-repeatable'));
    await waitFor(() =>
      expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(calls),
    );
    await done();
    expect(screen.getByTestId('uc-same')).toBeTruthy();
  });
});

describe('what would break a layout', () => {
  it('reads it from the value itself', () => {
    expect(flagsOf(null)).toEqual(['missing']);
    expect(flagsOf(undefined)).toEqual(['missing']);
    expect(flagsOf('')).toEqual(['blank']);
    expect(flagsOf('   ')).toEqual(['blank']);
    expect(flagsOf('x'.repeat(61))).toEqual(['long']);
    expect(flagsOf('ירושלים')).toEqual(['rtl']);
    expect(flagsOf('hi 🙈')).toEqual(['emoji']);
    expect(flagsOf(' padded ')).toEqual(['padded']);
    expect(flagsOf('Ada Lovelace')).toEqual([]);
    expect(flagsOf(42)).toEqual([]);
  });
});
