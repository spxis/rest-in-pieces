import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.tsx';
import { LocaleProvider } from './i18n/LocaleProvider.tsx';

const resources = [
  {
    name: 'names',
    description: 'People',
    idField: 'index',
    seeded: true,
    writable: true,
    fields: ['index', 'name', 'age'],
  },
  { name: 'countries', description: 'Countries', idField: 'alpha2', seeded: false, fields: ['alpha2', 'name'] },
];

const locales = [
  { code: 'en-CA', name: 'English (Canada)', nativeName: 'English (Canada)', tag: 'en-CA', default: true },
  { code: 'de', name: 'German (Germany)', nativeName: 'Deutsch (Deutschland)', tag: 'de-DE', default: false },
  { code: 'ja', name: 'Japanese (Japan)', nativeName: '日本語（日本）', tag: 'ja-JP', default: false },
  { code: 'global', name: 'Global mix', nativeName: 'Global mix', tag: null, default: false },
];

function mockApi() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const json = (body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } });
    if (url.pathname === '/resources') return json(resources);
    if (url.pathname === '/generators') return json({ generators: [], modules: { person: ['fullName'] } });
    if (url.pathname === '/locales') return json(locales);
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

  it('sets up a slow body and takes a delay range', async () => {
    const user = userEvent.setup();
    render(<App />);
    const snippet = screen.getByTestId('request-snippet');

    await user.click(screen.getByRole('button', { name: /Slow body/ }));
    expect(snippet.textContent).toBe('http://localhost:6800/names?limit=10&trickle=250');

    const delay = screen.getByPlaceholderText('1500 or 200-800');
    await user.type(delay, '200-800');
    expect(snippet.textContent).toContain('delay=200-800');
    await user.type(delay, '0000');
    expect(delay.getAttribute('aria-invalid')).toBe('true');
    expect(snippet.textContent).not.toContain('delay=');
  });

  it('offers the share link first once a scenario is applied', async () => {
    const user = userEvent.setup();
    render(<App />);
    const share = screen.getByRole('button', { name: 'Share link' });

    await user.click(screen.getByRole('button', { name: /Empty result/ }));
    expect(share.textContent).toBe('Share this scenario');
    // Once the setup moves on from the scenario, the button no longer claims to share it.
    await user.type(screen.getByPlaceholderText('Search every field…'), 'x');
    expect(share.textContent).toBe('Share link');

    await user.click(screen.getByRole('button', { name: /503 error/ }));
    expect(share.textContent).toBe('Share this scenario');
    await user.click(share);
    expect(share.textContent).toBe('Copied');
    const link = new URL(await navigator.clipboard.readText());
    expect(new URLSearchParams(link.hash.slice(1)).get('status')).toBe('503');
    // Only the button that copied says so.
    expect(screen.getByRole('button', { name: 'Share setup' }).textContent).toBe('Share setup');
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

  it('sends a write with its method and JSON body, and the snippets follow', async () => {
    const user = userEvent.setup();
    const api = mockApi();
    vi.stubGlobal('fetch', api);
    render(<App />);
    const snippet = screen.getByTestId('request-snippet');

    await user.click(await screen.findByRole('button', { name: 'POST' }));
    expect(snippet.textContent).toBe('POST http://localhost:6800/names');
    const body = screen.getByRole('textbox', { name: 'JSON body' }) as HTMLTextAreaElement;
    expect(JSON.parse(body.value)).toMatchObject({ name: 'Ada Lovelace' });
    expect(screen.queryByPlaceholderText('Search every field…')).toBeNull();
    // Paging scenarios mean nothing to a write; simulation ones still apply.
    expect(screen.queryByRole('button', { name: /Next page/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /503 error/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Answer 409 Conflict' }));
    expect(snippet.textContent).toBe('POST http://localhost:6800/names?conflict=true&status=503');

    await user.click(screen.getByRole('tab', { name: 'CURL' }));
    expect(snippet.textContent).toContain("-X POST -H 'Accept: application/json' -H 'Content-Type: application/json'");
    expect(snippet.textContent).toContain('"name":"Ada Lovelace"');

    await user.click(screen.getByRole('button', { name: /Send request/ }));
    const [url, init] = api.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:6800/names?conflict=true&status=503');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({ name: 'Ada Lovelace' });

    await user.click(screen.getByRole('button', { name: 'DELETE' }));
    await user.click(screen.getByRole('tab', { name: /REQUEST URL/ }));
    await user.clear(screen.getByRole('textbox', { name: 'Record id (index)' }));
    await user.type(screen.getByRole('textbox', { name: 'Record id (index)' }), '12');
    expect(snippet.textContent).toBe('DELETE http://localhost:6800/names/12?conflict=true&status=503');
    expect(screen.queryByRole('textbox', { name: 'JSON body' })).toBeNull();
  });

  it('warns about a body that is not JSON and keeps an edited body across methods', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'PUT' }));
    const body = screen.getByRole('textbox', { name: 'JSON body' });
    await user.clear(body);
    await user.type(body, '{{"name": ');
    expect(await screen.findByText(/Not valid JSON/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'POST' }));
    expect((screen.getByRole('textbox', { name: 'JSON body' }) as HTMLTextAreaElement).value).toBe('{"name": ');
    await user.click(screen.getByRole('button', { name: /Reset to sample/ }));
    expect(screen.queryByText(/Not valid JSON/)).toBeNull();
  });

  it('offers only GET on a dataset the API does not mark writable', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'POST' }));
    await user.click(screen.getByRole('tab', { name: /Countries/ }));
    expect(screen.queryByRole('button', { name: 'POST' })).toBeNull();
    expect(screen.getByText('GET', { selector: '.method-tag' })).toBeTruthy();
    expect(screen.getByTestId('request-snippet').textContent).toBe('http://localhost:6800/countries?limit=10');
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

  it('offers the locales the API lists, and a one-click global mix', async () => {
    const user = userEvent.setup();
    render(<App />);
    const picker = screen.getByRole('combobox', { name: 'Data locale' });
    expect(await screen.findByRole('option', { name: 'German (Germany)' })).toBeTruthy();
    await user.selectOptions(picker, 'de');
    expect(screen.getByTestId('request-snippet').textContent).toContain('locale=de');
    await user.click(screen.getByRole('button', { name: /Global users/ }));
    expect(screen.getByTestId('request-snippet').textContent).toContain('locale=global');
    expect((picker as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('Global mix');
  });

  it('starts a Japanese reader on Japanese data', async () => {
    render(
      <LocaleProvider initial="ja">
        <App />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('request-snippet').textContent).toContain('locale=ja');
    expect(screen.getByText('API プレイグラウンド', { selector: 'h1' })).toBeTruthy();
    // Locale names come from the runtime in the reader's language; the mix has a phrase of its own.
    expect(await screen.findByRole('option', { name: /ドイツ語/ })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'グローバル（全ロケール混在）' })).toBeTruthy();
  });
});
