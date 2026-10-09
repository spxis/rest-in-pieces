import { describe, expect, it } from 'vitest';
import { createApp } from '../src/core.ts';
import {
  allows,
  findAccount,
  parseLifetime,
  parseRequirement,
  signToken,
  TOKEN_KEY,
  verifyToken,
} from '../src/lib/auth.ts';

type Fields = Record<string, unknown>;
type Tokens = {
  tokenType: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: string;
  refreshExpiresIn: number;
  user: Fields & { id: number; role: string; username: string };
};

const app = createApp();

async function call<T = Fields>(
  method: string,
  path: string,
  { body, token }: { body?: unknown; token?: string } = {},
) {
  const res = await app.request(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { res, status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

const login = (username: string, query = '', password = 'password') =>
  call<Tokens>('POST', `/auth/login${query}`, { body: { username, password } });

const decode = (token: string) => JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as Fields;

describe('POST /auth/login', () => {
  it('signs the shortcuts in as the first three active users, with their roles', async () => {
    const users = (await call<{ results: Array<Fields & { id: number; active: boolean }> }>('GET', '/users?limit=20'))
      .body.results;
    const active = users.filter((user) => user.active);
    for (const [name, index] of [
      ['admin', 0],
      ['editor', 1],
      ['viewer', 2],
    ] as const) {
      const { status, body } = await login(name);
      expect(status, name).toBe(200);
      expect(body.user.id, name).toBe(active[index]?.id);
      expect(body.user.role, name).toBe(name);
      expect(body.tokenType).toBe('Bearer');
      expect(body.expiresIn).toBe(900);
      expect(body.refreshExpiresIn).toBe(7 * 24 * 3600);
      expect(decode(body.accessToken)).toMatchObject({ sub: String(body.user.id), role: name, typ: 'access' });
    }
  });

  it('takes any user by username or email, as a viewer unless they hold a role', async () => {
    const user = (await call<Fields & { username: string; email: string }>('GET', '/users/10')).body;
    expect((await login(user.username)).body.user.id).toBe(10);
    const byEmail = await call<Tokens>('POST', '/auth/login', { body: { email: user.email, password: 'password' } });
    expect(byEmail.body.user).toMatchObject({ id: 10, role: 'viewer' });
  });

  it('is seeded: the same seed and locale sign in the same person', async () => {
    const first = await login('admin', '?seed=7&locale=ja');
    const again = await login('admin', '?seed=7&locale=ja');
    expect(first.body.user).toEqual(again.body.user);
    expect(first.body.user.lastNameKana).toBeTruthy();
    expect(first.res.headers.get('content-language')).toBe('ja');
    expect((await login('admin')).body.user.username).not.toBe(first.body.user.username);
  });

  it('answers 401 for a wrong password or an unknown user, and 403 for a disabled account', async () => {
    for (const attempt of [login('admin', '', 'wrong'), login('nobody-at-all')]) {
      const { status, body } = await attempt;
      expect(status).toBe(401);
      expect(body).toMatchObject({ error: 'Unauthorized', code: 'invalid_credentials' });
    }
    const disabled = await login('disabled');
    expect(disabled.status).toBe(403);
    expect(disabled.body).toMatchObject({ code: 'account_disabled' });
  });

  it('answers 422 for a missing field', async () => {
    const noPassword = await call('POST', '/auth/login', { body: { username: 'admin' } });
    expect(noPassword.status).toBe(422);
    expect(noPassword.body).toEqual({ error: 'Validation failed', fields: { password: 'Required' } });
    const noName = await call('POST', '/auth/login', { body: { password: 'password' } });
    expect(noName.body).toEqual({ error: 'Validation failed', fields: { username: 'Required' } });
  });

  it('takes the simulation parameters, so a slow or failing sign-in can be rehearsed', async () => {
    const { status, res } = await login('admin', '?status=503');
    expect(status).toBe(503);
    expect(res.headers.get('x-simulated')).toBe('true');
  });
});

describe('GET /auth/me', () => {
  it('answers the signed-in user', async () => {
    const { body: tokens } = await login('editor');
    const me = await call<Fields>('GET', '/auth/me', { token: tokens.accessToken });
    expect(me.status).toBe(200);
    expect(me.body).toEqual(tokens.user);
  });

  it('answers 401 with a reason and a WWW-Authenticate header for no token, a bad one and an expired one', async () => {
    const none = await call('GET', '/auth/me');
    expect(none.status).toBe(401);
    expect(none.body).toMatchObject({ code: 'missing_token' });
    expect(none.res.headers.get('www-authenticate')).toBe('Bearer realm="rest-in-pieces"');

    const { body: tokens } = await login('admin');
    const tampered = `${tokens.accessToken.slice(0, -4)}AAAA`;
    for (const token of [tampered, 'not-a-jwt', tokens.refreshToken]) {
      const bad = await call('GET', '/auth/me', { token });
      expect(bad.status, token).toBe(401);
      expect(bad.body, token).toMatchObject({ code: 'invalid_token' });
      expect(bad.res.headers.get('www-authenticate'), token).toContain('error="invalid_token"');
    }

    const { body: stale } = await login('admin', '?expiresIn=0');
    const expired = await call('GET', '/auth/me', { token: stale.accessToken });
    expect(expired.status).toBe(401);
    expect(expired.body).toMatchObject({ code: 'token_expired' });
  });
});

describe('POST /auth/refresh and /auth/logout', () => {
  it('trades a refresh token for a new pair, even once the access token has expired', async () => {
    const { body: first } = await login('viewer', '?expiresIn=0');
    const refreshed = await call<Tokens>('POST', '/auth/refresh?expiresIn=5m', {
      body: { refreshToken: first.refreshToken },
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.expiresIn).toBe(300);
    expect(refreshed.body.user.id).toBe(first.user.id);
    expect((await call('GET', '/auth/me', { token: refreshed.body.accessToken })).status).toBe(200);
  });

  it('refuses an access token, an expired refresh token, and a missing one', async () => {
    const { body } = await login('viewer', '?refreshExpiresIn=0');
    expect((await call('POST', '/auth/refresh', { body: { refreshToken: body.accessToken } })).body).toMatchObject({
      code: 'invalid_token',
    });
    expect((await call('POST', '/auth/refresh', { body: { refreshToken: body.refreshToken } })).body).toMatchObject({
      code: 'token_expired',
    });
    expect((await call('POST', '/auth/refresh', { body: {} })).status).toBe(422);
  });

  it('signs out with 204', async () => {
    expect((await call('POST', '/auth/logout')).status).toBe(204);
  });
});

describe('?auth= on data endpoints', () => {
  it('leaves requests without it open, as before', async () => {
    expect((await call('GET', '/users?limit=1')).status).toBe(200);
  });

  it('answers 401 without a token and 200 with one, on lists, items and writes', async () => {
    const { body: tokens } = await login('viewer');
    for (const path of ['/users?auth=required', '/names/1?auth=true', '/generate?fields=a:person.firstName&auth=any']) {
      expect((await call('GET', path)).status, path).toBe(401);
      expect((await call('GET', path, { token: tokens.accessToken })).status, path).toBe(200);
    }
    expect((await call('DELETE', '/users/1?auth=required')).status).toBe(401);
    expect((await call('DELETE', '/users/1?auth=required', { token: tokens.accessToken })).status).toBe(204);
  });

  it('answers 403 when the role is not enough, and admin passes everything', async () => {
    const tokens = {
      admin: (await login('admin')).body.accessToken,
      editor: (await login('editor')).body.accessToken,
      viewer: (await login('viewer')).body.accessToken,
    };
    const expected = {
      editor: { admin: 200, editor: 200, viewer: 403 },
      admin: { admin: 200, editor: 403, viewer: 403 },
    } as const;
    for (const [requirement, byRole] of Object.entries(expected)) {
      for (const [role, status] of Object.entries(byRole)) {
        const res = await call('GET', `/products?auth=${requirement}`, { token: tokens[role as keyof typeof tokens] });
        expect(res.status, `${role} on auth=${requirement}`).toBe(status);
        if (status === 403) {
          expect(res.body).toMatchObject({ code: 'insufficient_role', required: requirement, role });
        }
      }
    }
  });

  it('lets a simulated status win over the check, and is no field filter or part of a cursor', async () => {
    expect((await call('GET', '/users?auth=required&status=503')).status).toBe(503);
    const { body: tokens } = await login('viewer');
    const page = await call<{ metadata: { nextCursor: string; total: number } }>(
      'GET',
      '/users?auth=required&cursor=',
      {
        token: tokens.accessToken,
      },
    );
    expect(page.body.metadata.total).toBe(1000);
    expect((await call('GET', `/users?cursor=${page.body.metadata.nextCursor}`)).status).toBe(200);
  });

  it('exposes WWW-Authenticate to browsers', async () => {
    const { res } = await call('GET', '/users?auth=required');
    expect(res.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
  });
});

describe('auth with the session on', () => {
  it('reads the user as the session holds them: a disabled or deleted account is refused', async () => {
    const kept = createApp({ session: true });
    const ask = (method: string, path: string, init: RequestInit = {}) => kept.request(path, { method, ...init });
    const json = { 'Content-Type': 'application/json' };
    const tokens = (await (
      await ask('POST', '/auth/login', {
        headers: json,
        body: JSON.stringify({ username: 'viewer', password: 'password' }),
      })
    ).json()) as Tokens;
    const bearer = { Authorization: `Bearer ${tokens.accessToken}` };

    await ask('PATCH', `/users/${tokens.user.id}`, { headers: json, body: JSON.stringify({ jobTitle: 'Engineer' }) });
    expect(((await (await ask('GET', '/auth/me', { headers: bearer })).json()) as Fields).jobTitle).toBe('Engineer');

    await ask('PATCH', `/users/${tokens.user.id}`, { headers: json, body: JSON.stringify({ active: false }) });
    expect((await ask('GET', '/auth/me', { headers: bearer })).status).toBe(403);

    await ask('DELETE', `/users/${tokens.user.id}`);
    expect((await ask('GET', '/auth/me', { headers: bearer })).status).toBe(401);
    expect(
      (
        await ask('POST', '/auth/refresh', {
          headers: json,
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        })
      ).status,
    ).toBe(401);
  });
});

describe('auth helpers', () => {
  it('reads lifetimes in seconds or with a unit, capped at 30 days', () => {
    expect(parseLifetime('30', 1)).toBe(30);
    expect(parseLifetime('30s', 1)).toBe(30);
    expect(parseLifetime('5m', 1)).toBe(300);
    expect(parseLifetime('2h', 1)).toBe(7200);
    expect(parseLifetime('1d', 1)).toBe(86400);
    expect(parseLifetime('0', 1)).toBe(0);
    expect(parseLifetime('999d', 1)).toBe(30 * 86400);
    expect(parseLifetime('soon', 1)).toBe(1);
    expect(parseLifetime(undefined, 1)).toBe(1);
  });

  it('reads requirements and checks roles', () => {
    expect(['true', 'required', 'any', 'viewer', '1'].map(parseRequirement)).toEqual(Array(5).fill('any'));
    expect(parseRequirement('Editor')).toBe('editor');
    expect(parseRequirement('admin')).toBe('admin');
    expect(parseRequirement(undefined)).toBeNull();
    expect(parseRequirement('false')).toBeNull();
    expect(allows('viewer', 'any')).toBe(true);
    expect(allows('viewer', 'editor')).toBe(false);
    expect(allows('admin', 'editor')).toBe(true);
    expect(allows('editor', 'admin')).toBe(false);
  });

  it('signs real HS256 JWTs with the published key, and refuses tokens signed with another', async () => {
    const claims = {
      sub: '1',
      role: 'admin' as const,
      typ: 'access' as const,
      seed: 1,
      locale: 'en-CA',
      iat: 0,
      exp: 4_000_000_000,
      iss: 'rest-in-pieces' as const,
    };
    const token = await signToken(claims);
    expect(JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString())).toEqual({
      alg: 'HS256',
      typ: 'JWT',
    });
    expect(await verifyToken(token, 'access')).toEqual(claims);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(TOKEN_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const [header, payload] = token.split('.');
    const signature = Buffer.from(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`)),
    ).toString('base64url');
    expect(token.split('.')[2]).toBe(signature);
    await expect(
      verifyToken(`${header}.${payload}.${Buffer.from('other').toString('base64url')}`, 'access'),
    ).rejects.toThrow('not issued by this API');
  });

  it('finds accounts by shortcut, username or email, ignoring case', () => {
    const users = [
      { id: 1, username: 'off', email: 'off@x', active: false },
      { id: 2, username: 'Ann', email: 'ann@x', active: true },
      { id: 3, username: 'bo', email: 'bo@x', active: true },
    ];
    expect(findAccount(users, 'admin')?.id).toBe(2);
    expect(findAccount(users, 'editor')?.id).toBe(3);
    expect(findAccount(users, 'viewer')).toBeUndefined();
    expect(findAccount(users, 'disabled')?.id).toBe(1);
    expect(findAccount(users, ' ANN ')?.id).toBe(2);
    expect(findAccount(users, 'BO@X')?.id).toBe(3);
  });
});
