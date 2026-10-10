/**
 * A reader for Server-Sent Events, written from the format's own rules (WHATWG HTML, "Server-sent events"), because the
 * playground reads a stream with `fetch`: the in-browser API answers `fetch`, not `EventSource`, and `fetch` can also
 * send `Last-Event-ID` itself. Text goes in as it arrives, in any pieces, and an event comes out when its blank line does.
 */

export interface SseEvent {
  /** The last `id:` seen, which a reconnect sends back; `null` before the stream has given one. */
  id: string | null;
  /** The `event:` name, or `message` when the event has none. */
  event: string;
  /** The `data:` lines joined with a newline. */
  data: string;
}

export interface SseReader {
  /** Reads a piece of the stream. */
  push(text: string): void;
  /** The stream has ended: a half-written event is dropped, as a browser drops it. */
  finish(): void;
}

/**
 * `onEvent` hears each event; `onComment` each `:` line (a stream's keep-alive or note); `onRetry` a `retry:` in
 * milliseconds. Lines end in LF, CR or CRLF, a leading BOM is ignored, and a field with no colon has an empty value.
 */
export function readSse(
  onEvent: (event: SseEvent) => void,
  onComment: (text: string) => void = () => {},
  onRetry: (milliseconds: number) => void = () => {},
): SseReader {
  let buffer = '';
  let first = true;
  let lastId: string | null = null;
  let data: string[] = [];
  let name = '';
  let hasData = false;

  const line = (text: string) => {
    if (text === '') {
      // A blank line ends the event; one with no data is not dispatched.
      if (hasData) onEvent({ id: lastId, event: name || 'message', data: data.join('\n') });
      data = [];
      name = '';
      hasData = false;
      return;
    }
    if (text.startsWith(':')) {
      onComment(text.slice(1).replace(/^ /, ''));
      return;
    }
    const colon = text.indexOf(':');
    const field = colon < 0 ? text : text.slice(0, colon);
    const value = colon < 0 ? '' : text.slice(colon + 1).replace(/^ /, '');
    if (field === 'data') {
      data.push(value);
      hasData = true;
    } else if (field === 'event') name = value;
    else if (field === 'id') {
      if (!value.includes('\0')) lastId = value;
    } else if (field === 'retry' && /^\d+$/.test(value)) onRetry(Number(value));
  };

  return {
    push(text) {
      buffer += first ? text.replace(/^﻿/, '') : text;
      first = false;
      // A CR at the very end may be half of a CRLF: wait for what follows it.
      const ready = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
      const lines = ready.split(/\r\n|\r|\n/);
      buffer = buffer.slice(ready.length - (lines.at(-1)?.length ?? 0));
      lines.pop();
      for (const text of lines) line(text);
    },
    finish() {
      buffer = '';
      data = [];
      name = '';
      hasData = false;
    },
  };
}
