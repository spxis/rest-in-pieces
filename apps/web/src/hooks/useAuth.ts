import { useCallback, useEffect, useRef, useState } from 'react';
import { trimBase } from '../lib/request.ts';

/** The accounts the sign-in panel offers: the API's shortcuts, and a wrong password. */
export const ACCOUNTS = ['admin', 'editor', 'viewer', 'disabled', 'wrong'] as const;
export type Account = (typeof ACCOUNTS)[number];

/** Access-token lifetimes the panel offers, as `expiresIn` takes them. `0` is already expired. */
export const LIFETIMES = ['15m', '30s', '0'] as const;
export type Lifetime = (typeof LIFETIMES)[number];

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  avatar?: string;
  jobTitle?: string;
  role: 'admin' | 'editor' | 'viewer';
  [field: string]: unknown;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthUser;
}

/** The last thing the API said to the panel, shown under its buttons. */
export interface AuthAnswer {
  action: 'login' | 'me' | 'refresh' | 'logout';
  status: number;
  code?: string;
  message?: string;
}

export interface AuthState {
  /** The access token requests carry, while signed in. */
  token: string | null;
  /** The username signed in with, so snippets sign in the same way. */
  username: string | null;
  user: AuthUser | null;
  /** When the access token expires, in epoch milliseconds. */
  expiresAt: number | null;
  answer: AuthAnswer | null;
  busy: boolean;
  /** The token's payload, decoded as any JWT library would. */
  claims: Record<string, unknown> | null;
  /** Signs in, and answers the new access token, or null when the API refused. */
  signIn(account: Account, lifetime: Lifetime, data?: { seed?: number; locale?: string }): Promise<string | null>;
  refresh(): Promise<void>;
  checkMe(): Promise<void>;
  signOut(): Promise<void>;
}

/** The middle part of a JWT, read without checking it, the way a frontend shows who is signed in. */
export function decodeClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1] ?? '';
    const bytes = Uint8Array.from(atob(part.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Signs in to the API's fake auth, holds the tokens for this tab only, and forgets them when the API changes. */
export function useAuth(apiBase: string): AuthState {
  const base = trimBase(apiBase);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AuthAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const lifetime = useRef<Lifetime>('15m');

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new API base means the old tokens mean nothing
  useEffect(() => {
    setTokens(null);
    setUsername(null);
    setAnswer(null);
  }, [base]);

  const call = useCallback(
    async (action: AuthAnswer['action'], path: string, init: RequestInit) => {
      setBusy(true);
      try {
        const response = await fetch(`${base}${path}`, init);
        const text = await response.text();
        const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
        setAnswer({
          action,
          status: response.status,
          ...(typeof body?.code === 'string' ? { code: body.code } : {}),
          ...(typeof body?.message === 'string'
            ? { message: body.message }
            : typeof body?.error === 'string' && response.status >= 400
              ? { message: body.error }
              : {}),
        });
        return { status: response.status, body };
      } catch {
        setAnswer({ action, status: 0 });
        return { status: 0, body: null };
      } finally {
        setBusy(false);
      }
    },
    [base],
  );

  const signIn = useCallback<AuthState['signIn']>(
    async (account, life, data = {}) => {
      lifetime.current = life;
      const query = new URLSearchParams({ expiresIn: life });
      if (data.seed !== undefined && data.seed !== 1) query.set('seed', String(data.seed));
      if (data.locale && data.locale !== 'en-CA') query.set('locale', data.locale);
      const name = account === 'wrong' ? 'viewer' : account;
      const { status, body } = await call('login', `/auth/login?${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, password: account === 'wrong' ? 'not-the-password' : 'password' }),
      });
      if (status === 200) {
        if (typeof body?.accessToken === 'string') setTokens(body as unknown as Tokens);
        setUsername(name);
        return typeof body?.accessToken === 'string' ? body.accessToken : null;
      }
      setTokens(null);
      setUsername(null);
      return null;
    },
    [call],
  );

  const refresh = useCallback(async () => {
    if (!tokens) return;
    const { status, body } = await call('refresh', `/auth/refresh?expiresIn=${lifetime.current}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (status === 200) if (typeof body?.accessToken === 'string') setTokens(body as unknown as Tokens);
  }, [call, tokens]);

  const checkMe = useCallback(async () => {
    await call('me', '/auth/me', tokens ? { headers: { Authorization: `Bearer ${tokens.accessToken}` } } : {});
  }, [call, tokens]);

  const signOut = useCallback(async () => {
    await call('logout', '/auth/logout', { method: 'POST' });
    setTokens(null);
    setUsername(null);
  }, [call]);

  return {
    token: tokens?.accessToken ?? null,
    username,
    user: tokens?.user ?? null,
    expiresAt: tokens ? Date.parse(tokens.expiresAt) : null,
    claims: tokens ? decodeClaims(tokens.accessToken) : null,
    answer,
    busy,
    signIn,
    refresh,
    checkMe,
    signOut,
  };
}

/** The time now, ticking once a second while `on`, for a countdown. It runs in the tab and asks nothing of the API. */
export function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}
