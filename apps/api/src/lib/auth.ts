/**
 * Fake sign-in, for rehearsing a frontend's login form, protected routes and expired tokens.
 *
 * NOT SECURITY. Every account's password is `password`, and tokens are signed with a key printed in
 * the README, so anyone can mint one. The tokens are real JWTs (HS256) only so that a client's own
 * JWT decoding works on them; they carry nothing that is checked anywhere but here.
 */
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { pick } from './query.ts';

/** The published signing key. It is a constant on purpose: these tokens protect nothing. */
export const TOKEN_KEY = 'rest-in-pieces-not-a-secret';
/** The one password every account takes. */
export const DEMO_PASSWORD = 'password';
/** Lifetimes, in seconds. */
export const ACCESS_TTL = 15 * 60;
export const REFRESH_TTL = 7 * 24 * 60 * 60;
export const MAX_TTL = 30 * 24 * 60 * 60;

export type Role = 'admin' | 'editor' | 'viewer';
export const ROLES: readonly Role[] = ['admin', 'editor', 'viewer'];
/** Usernames that sign in as the accounts each role is given to, and `disabled` as the first account that is not active. */
export const SHORTCUTS = ['admin', 'editor', 'viewer', 'disabled'] as const;

/** What `?auth=` asks for: any signed-in account, or one with at least this role. */
export type Requirement = 'any' | 'editor' | 'admin';

export interface TokenClaims {
  /** The user's id, as a string, as JWT has it. */
  sub: string;
  role: Role;
  /** `access` for API calls, `refresh` for `POST /auth/refresh`. One is refused where the other is wanted. */
  typ: 'access' | 'refresh';
  /** The dataset the user came from, so `/auth/me` reads the same person back. */
  seed: number;
  locale: string;
  iat: number;
  exp: number;
  iss: 'rest-in-pieces';
}

/** Why a token was refused, as the body's `code` and the `WWW-Authenticate` header give it. */
export type TokenProblem = 'missing_token' | 'invalid_token' | 'token_expired';

export class TokenError extends Error {
  readonly code: TokenProblem;
  constructor(code: TokenProblem, message: string) {
    super(message);
    this.code = code;
  }
}

const encoder = new TextEncoder();
const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
const encodeJson = (value: unknown) => base64Url(encoder.encode(JSON.stringify(value)));

let keyPromise: Promise<CryptoKey> | undefined;
const signingKey = () =>
  (keyPromise ??= crypto.subtle.importKey('raw', encoder.encode(TOKEN_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]));

const HEADER = encodeJson({ alg: 'HS256', typ: 'JWT' });

export async function signToken(claims: TokenClaims): Promise<string> {
  const body = `${HEADER}.${encodeJson(claims)}`;
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(body)));
  return `${body}.${base64Url(signature)}`;
}

/** Reads a token, refusing one that is malformed, was not signed here, is the other kind, or has expired. */
export async function verifyToken(token: string, typ: TokenClaims['typ'], now = Date.now()): Promise<TokenClaims> {
  const invalid = (why: string) => new TokenError('invalid_token', why);
  const [header, payload, signature, extra] = token.split('.');
  if (!header || !payload || !signature || extra !== undefined) throw invalid('The token is not a JWT.');
  let claims: TokenClaims;
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(),
      fromBase64Url(signature),
      encoder.encode(`${header}.${payload}`),
    );
    claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as TokenClaims;
  } catch {
    throw invalid('The token could not be read.');
  }
  if (!valid) throw invalid('The token was not issued by this API, or was changed after it was.');
  if (claims.typ !== typ) {
    throw invalid(typ === 'access' ? 'This is a refresh token. Send the access token.' : 'Send the refresh token.');
  }
  if (now / 1000 >= claims.exp) {
    throw new TokenError(
      'token_expired',
      typ === 'access'
        ? 'The access token has expired. Refresh it, or sign in again.'
        : 'The refresh token has expired. Sign in again.',
    );
  }
  return claims;
}

/**
 * A lifetime from `expiresIn`: seconds (`30`), or a number with `s`, `m`, `h` or `d` (`30s`, `5m`).
 * `0` gives a token that is already expired. Missing or unreadable values take the default.
 */
export function parseLifetime(value: string | undefined, fallback: number): number {
  const match = value?.trim().match(/^(\d+)\s*([smhd]?)$/);
  if (!match) return fallback;
  const unit = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[match[2] as '' | 's' | 'm' | 'h' | 'd'];
  return Math.min(Number(match[1]) * unit, MAX_TTL);
}

/** `?auth=` as a requirement: `true`, `required` or `any` for any account, `editor` or `admin` for a role; anything else none. */
export function parseRequirement(value: string | undefined): Requirement | null {
  const v = value?.toLowerCase();
  if (v === 'true' || v === 'required' || v === 'any' || v === 'viewer' || v === '1') return 'any';
  if (v === 'editor' || v === 'admin') return v;
  return null;
}

/** Whether a role meets a requirement: admin covers editor, and any role covers `any`. */
export function allows(role: Role, requirement: Requirement): boolean {
  if (requirement === 'any') return true;
  if (requirement === 'editor') return role === 'editor' || role === 'admin';
  return role === 'admin';
}

/** The bearer token from `Authorization`, or undefined. */
export function bearerToken(c: Context): string | undefined {
  const header = c.req.header('Authorization');
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match?.[1];
}

const REALM = 'rest-in-pieces';

/** The `401` a client gets for a missing, invalid or expired token, with the header RFC 6750 asks for. */
export function unauthorized(c: Context, problem: TokenError) {
  const challenge =
    problem.code === 'missing_token'
      ? `Bearer realm="${REALM}"`
      : `Bearer realm="${REALM}", error="invalid_token", error_description="${problem.message.replaceAll('"', "'")}"`;
  c.header('WWW-Authenticate', challenge);
  return c.json({ error: 'Unauthorized', code: problem.code, message: problem.message }, 401);
}

/** The `403` for a signed-in account whose role is not enough. */
export function forbidden(c: Context, role: Role, requirement: Exclude<Requirement, 'any'>) {
  c.header('WWW-Authenticate', `Bearer realm="${REALM}", error="insufficient_scope"`);
  return c.json(
    {
      error: 'Forbidden',
      code: 'insufficient_role',
      message: `This needs the ${requirement} role${requirement === 'editor' ? ' or admin' : ''}; you are signed in as ${role}.`,
      required: requirement,
      role,
    },
    403,
  );
}

/** Reads and checks the request's access token, or throws the `TokenError` to answer with. */
export async function accessClaims(c: Context): Promise<TokenClaims> {
  const token = bearerToken(c);
  if (!token) {
    throw new TokenError('missing_token', 'Sign in and send the access token as "Authorization: Bearer <token>".');
  }
  return verifyToken(token, 'access');
}

/**
 * Guards a data endpoint when the request asks for it with `?auth=`, so a frontend can rehearse a
 * protected route: `401` without a valid token, `403` for a role that is not enough.
 */
export const requireAuth = () =>
  createMiddleware(async (c, next) => {
    const requirement = parseRequirement(pick(c.req.query(), 'auth'));
    if (!requirement) return next();
    let claims: TokenClaims;
    try {
      claims = await accessClaims(c);
    } catch (error) {
      if (error instanceof TokenError) return unauthorized(c, error);
      throw error;
    }
    if (requirement !== 'any' && !allows(claims.role, requirement)) return forbidden(c, claims.role, requirement);
    return next();
  });

type UserRecord = Record<string, unknown> & { id: number; username: string; email: string; active: boolean };

/**
 * Who has which role: the first active user is the admin, the second the editor, and everyone else
 * a viewer. Ordered by id, so it is the same for a seed and locale on every machine.
 */
export function roleOf(users: readonly UserRecord[], user: UserRecord): Role {
  const active = users.filter((record) => record.active);
  const rank = active.findIndex((record) => record.id === user.id);
  return rank === 0 ? 'admin' : rank === 1 ? 'editor' : 'viewer';
}

/** The user a login names: a username or email from `/users`, or one of the shortcuts. */
export function findAccount(users: readonly UserRecord[], login: string): UserRecord | undefined {
  const name = login.trim().toLowerCase();
  const active = users.filter((record) => record.active);
  if (name === 'admin') return active[0];
  if (name === 'editor') return active[1];
  if (name === 'viewer') return active[2];
  if (name === 'disabled') return users.find((record) => !record.active);
  return users.find((record) => record.username.toLowerCase() === name || record.email.toLowerCase() === name);
}
