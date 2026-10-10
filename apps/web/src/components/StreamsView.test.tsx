import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider.tsx';
import { buildStreamUrl, MAX_STREAM_EVENTS, streamSnippets } from '../lib/request.ts';
import { StreamsView } from './StreamsView.tsx';

const sse = (text: string, init: ResponseInit = {}) =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' }, ...init },
  );

const event = (id: number, data: object) => `id: ${id}\ndata: ${JSON.stringify(data)}\n\n`;

function show() {
  return render(
    <LocaleProvider initial="en">
      <StreamsView
        apiBase="http://api.test"
        locale="en-CA"
        seed={1}
        copied={null}
        onCopy={() => {}}
        tabs={<div data-testid="tabs" />}
      />
    </LocaleProvider>,
  );
}

describe('the request that listens', () => {
  it('names the stream and what was asked, and leaves the API defaults off', () => {
    const setup = { stream: 'logs', count: 10, every: 500, drop: 0, seed: 1, locale: 'en-CA' } as const;
    expect(buildStreamUrl('http://api.test/', setup)).toBe('http://api.test/streams/logs?count=10&every=500');
    expect(buildStreamUrl('http://api.test', { ...setup, seed: 7, locale: 'ja', drop: 3 })).toBe(
      'http://api.test/streams/logs?count=10&every=500&seed=7&locale=ja&drop=3',
    );
    const { javascript, curl } = streamSnippets('http://api.test/streams/logs?count=2');
    expect(javascript).toContain("new EventSource('http://api.test/streams/logs?count=2')");
    expect(curl).toBe("curl -N 'http://api.test/streams/logs?count=2'");
    expect(MAX_STREAM_EVENTS).toBe(500);
  });
});

describe('the Streams tab', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('shows the events as they arrive, and says it finished at the end event', async () => {
    fetchMock.mockResolvedValueOnce(
      sse(
        `retry: 3000\n\n${event(1, { id: 1, level: 'info' })}${event(2, { id: 2, level: 'warn' })}id: 2\nevent: end\ndata: {}\n\n`,
      ),
    );
    show();
    expect(screen.getByTestId('stream-state').dataset.state).toBe('idle');
    await userEvent.click(screen.getByTestId('stream-start'));
    await waitFor(() => expect(screen.getByTestId('stream-state').dataset.state).toBe('ended'));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/streams/messages?count=10&every=500');
    expect((init.headers as Record<string, string>)['Last-Event-ID']).toBeUndefined();
    const rows = screen.getByTestId('stream-log').querySelectorAll('li');
    expect(rows).toHaveLength(2);
    expect(rows[1]?.textContent).toContain('level: warn');
    expect(screen.getByTestId('stream-count-seen').textContent).toBe('2 received');
    expect(screen.queryByTestId('stream-resume')).toBeNull();
  });

  it('offers to resume after a drop, and sends the last id when it does', async () => {
    fetchMock
      .mockResolvedValueOnce(sse(event(1, { id: 1 }) + event(2, { id: 2 })))
      .mockResolvedValueOnce(sse(`${event(3, { id: 3 })}id: 3\nevent: end\ndata: {}\n\n`));
    show();
    await userEvent.type(screen.getByTestId('stream-drop'), '{backspace}2');
    await userEvent.click(screen.getByTestId('stream-start'));
    await waitFor(() => expect(screen.getByTestId('stream-state').dataset.state).toBe('dropped'));
    expect((fetchMock.mock.calls[0] as [string])[0]).toContain('drop=2');
    await userEvent.click(screen.getByTestId('stream-resume'));
    await waitFor(() => expect(screen.getByTestId('stream-state').dataset.state).toBe('ended'));
    const second = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((second[1].headers as Record<string, string>)['Last-Event-ID']).toBe('2');
    expect(screen.getByTestId('stream-log').querySelectorAll('li')).toHaveLength(3);
  });

  it("says so when nothing is left (204) and when the stream is refused, with the API's own words", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    show();
    await userEvent.click(screen.getByTestId('stream-start'));
    await waitFor(() => expect(screen.getByTestId('stream-state').dataset.state).toBe('ended'));
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: 'Service Unavailable' }, { status: 503, statusText: 'Service Unavailable' }),
    );
    await userEvent.click(screen.getByTestId('stream-start'));
    await waitFor(() => expect(screen.getByTestId('stream-state').dataset.state).toBe('failed'));
    expect(screen.getByRole('alert').textContent).toContain('503 Service Unavailable');
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    await userEvent.click(screen.getByTestId('stream-start'));
    await waitFor(() => expect(screen.getByTestId('stream-state').dataset.state).toBe('failed'));
  });

  it('stops a stream that is flowing, and keeps what it received', async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          const body = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(event(1, { id: 1 })));
              init.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
            },
          });
          resolve(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
        }),
    );
    show();
    await userEvent.click(screen.getByTestId('stream-start'));
    await waitFor(() => expect(screen.getByTestId('stream-state').dataset.state).toBe('open'));
    await waitFor(() => expect(screen.getByTestId('stream-log').querySelectorAll('li')).toHaveLength(1));
    expect((screen.getByTestId('stream-name') as HTMLSelectElement).disabled).toBe(true);
    await userEvent.click(screen.getByTestId('stream-stop'));
    await waitFor(() => expect(screen.getByTestId('stream-state').dataset.state).toBe('stopped'));
    expect(screen.getByTestId('stream-log').querySelectorAll('li')).toHaveLength(1);
    expect(screen.getByTestId('stream-resume')).toBeTruthy();
  });

  it('keeps the settings in range and changes the stream it asks for', async () => {
    show();
    await userEvent.selectOptions(screen.getByTestId('stream-name'), 'metrics');
    const count = screen.getByTestId('stream-count') as HTMLInputElement;
    await userEvent.clear(count);
    await userEvent.type(count, '99999');
    expect(count.value).toBe('500');
    const every = screen.getByTestId('stream-every') as HTMLInputElement;
    await userEvent.clear(every);
    await userEvent.type(every, '5');
    expect(Number(every.value)).toBeGreaterThanOrEqual(100);
    expect(screen.getByTestId('stream-code').textContent).toContain('/streams/metrics?count=500');
  });
});
