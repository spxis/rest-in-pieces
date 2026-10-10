import { useCallback, useEffect, useRef, useState } from 'react';
import { readSse } from '../lib/sse.ts';

/** How a stream stands: before it, while it connects, flowing, finished, cut short by the server or by the reader, or refused. */
export type StreamState = 'idle' | 'connecting' | 'open' | 'ended' | 'dropped' | 'stopped' | 'failed';

export interface StreamEntry {
  /** Which event this is in the stream so far, from 1: a key that survives older events scrolling off. */
  n: number;
  /** The event's own id, the record's `id`. */
  id: string;
  /** The `data`, parsed when it is JSON. */
  data: unknown;
  /** The text as sent. */
  raw: string;
  /** Milliseconds from the connection opening to the event arriving. */
  at: number;
}

/** The most events kept on screen; older ones scroll off, the stream goes on. */
export const KEPT_EVENTS = 200;

/** Why a stream failed to open, for the panel to say in the reader's language. */
export interface StreamProblem {
  status: number | null;
  message: string;
}

/**
 * Listens to a Server-Sent Events stream with `fetch`, because the API running inside the page answers `fetch` and not
 * `EventSource`. One stream at a time: starting another closes the first. `resume` sends the last id as `Last-Event-ID`,
 * which is what `EventSource` does by itself after a drop; a `204` says there is nothing left to send.
 */
export function useStream() {
  const [state, setState] = useState<StreamState>('idle');
  const [events, setEvents] = useState<StreamEntry[]>([]);
  const [problem, setProblem] = useState<StreamProblem | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const seen = useRef(0);

  const stop = useCallback(() => {
    controller.current?.abort();
  }, []);

  const start = useCallback(async (url: string, resume = false) => {
    controller.current?.abort();
    const mine = new AbortController();
    controller.current = mine;
    const from = resume ? lastIdRef.current : null;
    if (!resume) {
      lastIdRef.current = null;
      seen.current = 0;
      setEvents([]);
      setLastId(null);
      setCount(0);
    }
    setProblem(null);
    setState('connecting');
    const opened = performance.now();
    let sawEnd = false;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'text/event-stream', ...(from ? { 'Last-Event-ID': from } : {}) },
        signal: mine.signal,
      });
      if (response.status === 204) {
        setState('ended');
        return;
      }
      if (!response.ok || !response.body) {
        let message = response.statusText;
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // The body was not JSON; the status line is what there is.
        }
        setProblem({ status: response.status, message });
        setState('failed');
        return;
      }
      setState('open');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const sse = readSse((event) => {
        if (event.id !== null) {
          lastIdRef.current = event.id;
          setLastId(event.id);
        }
        if (event.event === 'end') {
          sawEnd = true;
          return;
        }
        let data: unknown = event.data;
        try {
          data = JSON.parse(event.data);
        } catch {
          // Not JSON: shown as the text it is.
        }
        seen.current += 1;
        const n = seen.current;
        setCount(n);
        setEvents((kept) =>
          [...kept, { n, id: event.id ?? '', data, raw: event.data, at: Math.round(performance.now() - opened) }].slice(
            -KEPT_EVENTS,
          ),
        );
      });
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        sse.push(decoder.decode(chunk.value, { stream: true }));
      }
      sse.finish();
      setState(sawEnd ? 'ended' : 'dropped');
    } catch (error) {
      if (mine.signal.aborted) {
        if (controller.current === mine) setState('stopped');
        return;
      }
      setProblem({ status: null, message: error instanceof Error ? error.message : '' });
      setState('failed');
    } finally {
      if (controller.current === mine) controller.current = null;
    }
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  return { state, events, problem, lastId, count, start, stop };
}
