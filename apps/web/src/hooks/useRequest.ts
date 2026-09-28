import { useCallback, useRef, useState } from 'react';
import type { OutputFormat } from '../lib/config.ts';
import { mimeFor } from '../lib/request.ts';

export interface RequestResult {
  url: string;
  status: number;
  statusText: string;
  duration: number;
  size: number;
  contentType: string;
  /** The body as received. */
  raw: string;
  /** Pretty-printed when the body is JSON. */
  body: string;
  json: unknown;
  headers: Array<[string, string]>;
  totalCount: number | null;
}

/** Sends requests one at a time; starting a new one cancels any still in flight. */
export function useRequest() {
  const [result, setResult] = useState<RequestResult | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const send = useCallback(async (url: string, format: OutputFormat) => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setSending(true);
    setError('');
    const started = performance.now();
    try {
      const response = await fetch(url, { headers: { Accept: mimeFor(format) }, signal: controller.signal });
      const raw = await response.text();
      const contentType = response.headers.get('content-type') ?? 'unknown';
      let json: unknown = null;
      let body = raw;
      if (contentType.includes('json') && raw) {
        try {
          json = JSON.parse(raw);
          body = JSON.stringify(json, null, 2);
        } catch {
          json = null;
        }
      }
      const total = response.headers.get('x-total-count');
      setResult({
        url,
        status: response.status,
        statusText: response.statusText,
        duration: Math.round(performance.now() - started),
        size: new TextEncoder().encode(raw).length,
        contentType,
        raw,
        body,
        json,
        headers: [...response.headers.entries()].sort(([a], [b]) => a.localeCompare(b)),
        totalCount: total === null ? null : Number(total),
      });
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setResult(null);
      setError(
        requestError instanceof TypeError
          ? 'The API could not be reached. Check the base URL and that the server is running.'
          : requestError instanceof Error
            ? requestError.message
            : 'Request failed',
      );
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setSending(false);
      }
    }
  }, []);

  return { result, error, sending, send };
}
