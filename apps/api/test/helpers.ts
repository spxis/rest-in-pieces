import { app } from '../src/app.ts';

export interface Envelope<T = Record<string, unknown>> {
  metadata: {
    count: number;
    total: number;
    output: { results: string };
    version: string;
    parameters: Record<string, unknown>;
    links: { self: string; first: string; last: string; prev: string | null; next: string | null };
    nextCursor: string | null;
    prevCursor: string | null;
  };
  results: T[];
}

export async function request<T = Envelope>(path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  const text = await res.text();
  const type = res.headers.get('content-type') ?? '';
  return { res, status: res.status, text, body: (type.includes('json') && text ? JSON.parse(text) : text) as T };
}

export const postJson = <T = Envelope>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
