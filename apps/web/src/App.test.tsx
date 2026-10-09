import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.tsx';
import { LocaleProvider } from './i18n/LocaleProvider.tsx';

const resources = [
  { name: 'names', description: 'People', idField: 'index', seeded: true, fields: ['index', 'name', 'age'] },
  { name: 'countries', description: 'Countries', idField: 'alpha2', seeded: false, fields: ['alpha2', 'name'] },
];

function mockApi() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const json = (body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } });
    if (url.pathname === '/resources') return json(resources);
    if (url.pathname === '/generators') return json({ generators: [], modules: { person: ['fullName'] } });
    const offset = Number(url.searchParams.get('offset') ?? 0);
    return json(
      {
        metadata: { output: { results: 'results' } },
        results: [{ index: offset, name: `Person ${offset}`, age: 30 }],
      },
      { 'x-total-count': '30' },
    );
  });
}

describe('App', () => {
  beforeEach(() => {
    window.location.hash = '';
    vi.stubGlobal('fetch', mockApi());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('builds the request URL as controls change', async () => {
    const user = userEvent.setup();
    render(<App />);
    const snippet = screen.getByTestId('request-snippet');
    expect(snippet.textContent).toBe('http://localhost:6800/names?limit=10');

    await user.click(screen.getByRole('button', { name: /503 error/ }));
    expect(snippet.textContent).toContain('status=503');
    await user.type(screen.getByPlaceholderText('Search every field…'), 'ada');
    expect(snippet.textContent).toContain('q=ada');
  });

  it('sends the request, shows a table and pages through results', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Send request/ }));

    expect(await screen.findByRole('cell', { name: 'Person 0' })).toBeTruthy();
    expect(screen.getByText('Page 1 of 3')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Next results page' }));
    expect(await screen.findByRole('cell', { name: 'Person 10' })).toBeTruthy();
    expect(screen.getByTestId('request-snippet').textContent).toContain('offset=10');
  });

  it('switches datasets from the API catalog', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: /Countries/ }));
    await waitFor(() =>
      expect(screen.getByTestId('request-snippet').textContent).toBe('http://localhost:6800/countries?limit=10'),
    );
  });

  it('explains when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /Send request/ }));
    expect(await screen.findByText(/could not be reached/)).toBeTruthy();
  });

  it('switches the playground to Japanese and remembers the choice', async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    render(
      <LocaleProvider initial="en">
        <App />
      </LocaleProvider>,
    );
    await user.click(screen.getByRole('button', { name: '日本語' }));
    expect(screen.getByRole('button', { name: /リクエストを送信/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '日本語' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.lang).toBe('ja');
    expect(window.localStorage.getItem('rest-in-pieces:lang')).toBe('ja');
  });

  it('asks for Japanese data from the data locale control', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Data locale' }), 'ja');
    expect(screen.getByTestId('request-snippet').textContent).toContain('locale=ja');
  });

  it('starts a Japanese reader on Japanese data', () => {
    render(
      <LocaleProvider initial="ja">
        <App />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('request-snippet').textContent).toContain('locale=ja');
    expect(screen.getByText('API プレイグラウンド', { selector: 'h1' })).toBeTruthy();
  });
});
