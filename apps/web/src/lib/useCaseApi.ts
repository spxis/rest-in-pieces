import { defaultApiBase } from './config.ts';
import { trimBase } from './request.ts';

/** A request a use case makes. The path is the one its snippets show, so what animates is what you copy. */
export interface UseCaseRequest {
  method?: 'GET' | 'POST';
  /** Path and query, starting with `/`. */
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** What came back, kept whole so an animation can draw the real status, time, headers and body. */
export interface Reply {
  status: number;
  ok: boolean;
  /** Milliseconds from sending to the whole body. */
  ms: number;
  headers: Headers;
  text: string;
  /** The body as JSON, or `null` when it is not JSON (SQL, NDJSON). */
  json: unknown;
}

/** The API the animations call: the one inside this page on GitHub Pages, otherwise the playground's own default. */
export function caseApiBase(): string {
  return trimBase(defaultApiBase());
}

function init(request: UseCaseRequest): RequestInit {
  const hasBody = request.body !== undefined;
  return {
    method: request.method ?? 'GET',
    headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...request.headers },
    ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
  };
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Sends a request to the API and reads the whole answer. A failing status is an answer, not an exception. */
export async function call(base: string, request: UseCaseRequest): Promise<Reply> {
  const started = performance.now();
  const response = await fetch(`${base}${request.path}`, init(request));
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    ms: Math.round(performance.now() - started),
    headers: response.headers,
    text,
    json: parse(text),
  };
}

/** What a body that arrives in pieces looked like: when the headers came, and when the last piece did. */
export interface Streamed {
  status: number;
  headersMs: number;
  totalMs: number;
  pieces: number;
  text: string;
}

/** Reads a response piece by piece, calling `onPiece` with each as it arrives (`trickle=` sends them apart). */
export async function stream(
  base: string,
  request: UseCaseRequest,
  onPiece: (text: string, atMs: number) => void,
): Promise<Streamed> {
  const started = performance.now();
  const response = await fetch(`${base}${request.path}`, init(request));
  const headersMs = Math.round(performance.now() - started);
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let pieces = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const piece = decoder.decode(value, { stream: true });
      text += piece;
      pieces += 1;
      onPiece(piece, Math.round(performance.now() - started));
    }
  }
  return { status: response.status, headersMs, totalMs: Math.round(performance.now() - started), pieces, text };
}
