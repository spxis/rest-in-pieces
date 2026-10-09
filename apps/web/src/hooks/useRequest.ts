import { useCallback, useRef, useState } from 'react';
import type { OutputFormat } from '../lib/config.ts';
import { takesBody } from '../lib/config.ts';
import { mimeFor, type SendOptions } from '../lib/request.ts';

/** Errors the playground describes itself, in the reader's language. Any other error is the API's own message. */
export const UNREACHABLE = 'response.unreachable';
export const REQUEST_FAILED = 'response.requestFailed';

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

  const send = useCallback(
    async (
      url: string,
      format: OutputFormat,
      { method, body: payload, token }: SendOptions & { token?: string | null } = { method: 'GET' },
    ) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setSending(true);
      setError('');
      const started = performance.now();
      try {
        const withBody = takesBody(method);
        const response = await fetch(url, {
          method,
          // Writes answer JSON whatever the reads were set to.
          headers: {
            Accept: mimeFor(method === 'GET' ? format : 'json'),
            ...(withBody ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(withBody ? { body: payload ?? '' } : {}),
          signal: controller.signal,
        });
        const raw = await response.text();
        const contentType = response.headers.get('content-type') ?? 'unknown';
        let json: unknown = null;
        let body = raw;
        if (contentType.includes('ndjson') && raw) {
          // One record a line: the table and the preview read them as a list; the body stays as sent.
          try {
            json = raw
              .split('\n')
              .filter((line) => line.trim() !== '')
              .map((line) => JSON.parse(line) as unknown);
          } catch {
            json = null;
          }
        } else if (contentType.includes('json') && raw) {
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
            ? UNREACHABLE
            : requestError instanceof Error
              ? requestError.message
              : REQUEST_FAILED,
        );
      } finally {
        if (inFlight.current === controller) {
          inFlight.current = null;
          setSending(false);
        }
      }
    },
    [],
  );

  return { result, error, sending, send };
}
