import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  ACCESS_TTL,
  accessClaims,
  DEMO_PASSWORD,
  findAccount,
  parseLifetime,
  REFRESH_TTL,
  ROLES,
  type Role,
  roleOf,
  signToken,
  TOKEN_KEY,
  type TokenClaims,
  TokenError,
  unauthorized,
  verifyToken,
} from '../lib/auth.ts';
import { contentLanguage, type Locale, parseLocale } from '../lib/locale.ts';
import { intParam, pick } from '../lib/query.ts';
import type { Session, SessionResource } from '../lib/session.ts';
import { DEFAULT_SEED, MAX_SEED } from '../resources.ts';
import { AuthError, ListQuery, User, ValidationErrorBody } from '../schemas.ts';
import { fieldErrors } from './writes.ts';

const NOT_SECURITY =
  '**Not security.** Every account takes the password `password`, and tokens are HS256 JWTs signed with the ' +
  `published key \`${TOKEN_KEY}\`, so anyone can mint one. They exist so a frontend can rehearse a sign-in ` +
  'form, protected routes, roles and expired tokens against realistic answers.';

const ACCOUNTS =
  'Any user of `/users` signs in with their `username` or `email`, at the `seed` and `locale` given in the ' +
  'query. The first active user is the `admin`, the second the `editor`, and every other user a `viewer`; the ' +
  'usernames `admin`, `editor` and `viewer` sign in as those accounts, and `disabled` names the first account ' +
  'that is not active, which is refused with `403`.';

export const AuthUser = User.extend({
  role: z.enum(ROLES as [Role, ...Role[]]).openapi({
    description: '`admin` passes every `?auth=` check, `editor` passes `auth=editor`, `viewer` only `auth=required`.',
  }),
}).openapi('AuthUser');

const Tokens = z
  .object({
    tokenType: z.literal('Bearer'),
    accessToken: z.string().openapi({ description: 'Send as `Authorization: Bearer <accessToken>`.' }),
    expiresIn: z.number().int().openapi({ description: 'Seconds the access token lasts.', example: ACCESS_TTL }),
    expiresAt: z.string().datetime(),
    refreshToken: z.string().openapi({ description: 'Send to `POST /auth/refresh` for a new pair.' }),
    refreshExpiresIn: z.number().int().openapi({ example: REFRESH_TTL }),
    user: AuthUser,
  })
  .openapi('AuthTokens');

const LoginBody = z
  .object({
    username: z.string().optional().openapi({ description: 'A username or email from `/users`, or a shortcut.' }),
    email: z.string().optional().openapi({ description: 'Accepted in place of `username`.' }),
    password: z.string().openapi({ example: DEMO_PASSWORD }),
  })
  .openapi('LoginRequest', { example: { username: 'admin', password: DEMO_PASSWORD } });

const RefreshBody = z.object({ refreshToken: z.string() }).openapi('RefreshRequest');

const lifetimeDocs = (what: string, fallback: string) =>
  `How long the ${what} lasts: seconds (\`30\`) or with a unit (\`30s\`, \`5m\`, \`2h\`, \`7d\`), up to 30 days. \`0\` gives one that has already expired, to rehearse the expired path at once. Default ${fallback}.`;

const TokenQuery = z.object({
  seed: ListQuery.shape.seed,
  locale: ListQuery.shape.locale,
  expiresIn: z
    .string()
    .optional()
    .openapi({ description: lifetimeDocs('access token', '15 minutes') }),
  refreshExpiresIn: z
    .string()
    .optional()
    .openapi({ description: lifetimeDocs('refresh token', '7 days') }),
  delay: ListQuery.shape.delay,
  status: ListQuery.shape.status,
  fail: ListQuery.shape.fail,
});

const json = (schema: z.ZodType, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

const tokenResponses = {
  200: json(Tokens, 'A new access token and refresh token, and the signed-in user.'),
  401: json(AuthError, 'Wrong username or password, or a refresh token that is invalid or expired.'),
  403: json(AuthError, 'The account is not active (`account_disabled`).'),
  422: json(ValidationErrorBody, 'A field is missing.'),
};

const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  tags: ['Auth'],
  operationId: 'login',
  summary: 'Sign in',
  description: `Checks a username and password and answers with an access token and a refresh token.\n\n${ACCOUNTS}\n\n${NOT_SECURITY}`,
  request: { query: TokenQuery, body: { required: true, content: { 'application/json': { schema: LoginBody } } } },
  responses: tokenResponses,
});

const refreshRoute = createRoute({
  method: 'post',
  path: '/refresh',
  tags: ['Auth'],
  operationId: 'refreshToken',
  summary: 'Trade a refresh token for new tokens',
  description: `Answers a new pair, read again from the user's current record. Tokens are not stored, so an old refresh token keeps working until it expires.\n\n${NOT_SECURITY}`,
  request: {
    query: TokenQuery.omit({ seed: true, locale: true }),
    body: { required: true, content: { 'application/json': { schema: RefreshBody } } },
  },
  responses: tokenResponses,
});

const meRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Auth'],
  operationId: 'getMe',
  summary: 'The signed-in user',
  description: `Answers the user the access token names, with their role. \`401\` with \`code\` \`missing_token\`, \`invalid_token\` or \`token_expired\`, and a \`WWW-Authenticate\` header, when the token is missing, wrong or expired.\n\n${NOT_SECURITY}`,
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({ delay: ListQuery.shape.delay, status: ListQuery.shape.status, fail: ListQuery.shape.fail }),
  },
  responses: {
    200: json(AuthUser, 'The signed-in user.'),
    401: json(AuthError, 'No token, a token that is not valid, or one that has expired.'),
    403: json(AuthError, 'The account is no longer active.'),
  },
});

const logoutRoute = createRoute({
  method: 'post',
  path: '/logout',
  tags: ['Auth'],
  operationId: 'logout',
  summary: 'Sign out',
  description:
    'Answers `204`. Tokens are not stored, so signing out is the client forgetting its tokens; this endpoint is here so the call a real app makes has somewhere to go.',
  security: [{}, { bearerAuth: [] }],
  responses: { 204: { description: 'Signed out.' } },
});

type UserRecord = Record<string, unknown> & { id: number; username: string; email: string; active: boolean };

/** `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` and `POST /auth/logout`, reading users through the session. */
export function authRoutes(users: SessionResource, session: Session) {
  const recordsAt = (seed: number, locale: Locale) => session.load(users, seed, locale).records as UserRecord[];
  const fail = (c: Context, status: 401 | 403, code: string, message: string) =>
    c.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden', code, message }, status);
  const disabled = (c: Context) =>
    fail(c, 403, 'account_disabled', 'This account is not active. Ask an admin to turn it back on.');

  async function issue(c: Context, user: UserRecord, all: readonly UserRecord[], seed: number, locale: Locale) {
    const query = c.req.query();
    const now = Math.floor(Date.now() / 1000);
    const access = parseLifetime(pick(query, 'expiresIn'), ACCESS_TTL);
    const refresh = parseLifetime(pick(query, 'refreshExpiresIn'), REFRESH_TTL);
    const role = roleOf(all, user);
    const claims = { sub: String(user.id), role, seed, locale, iat: now, iss: 'rest-in-pieces' as const };
    contentLanguage(c, locale);
    return c.json({
      tokenType: 'Bearer' as const,
      accessToken: await signToken({ ...claims, typ: 'access', exp: now + access }),
      expiresIn: access,
      expiresAt: new Date((now + access) * 1000).toISOString(),
      refreshToken: await signToken({ ...claims, typ: 'refresh', exp: now + refresh }),
      refreshExpiresIn: refresh,
      user: { ...user, role },
    });
  }

  /** The user a token names, as the dataset holds them now. */
  const userFor = (claims: TokenClaims) => {
    const all = recordsAt(claims.seed, parseLocale(claims.locale));
    return { all, user: all.find((record) => String(record.id) === claims.sub) };
  };
  const gone = new TokenError('invalid_token', 'The account this token names no longer exists.');

  return new OpenAPIHono({
    defaultHook: (result, c) => {
      if (result.success || result.target !== 'json') return;
      const fields = fieldErrors(result.error.issues, (result as { data?: unknown }).data);
      return c.json({ error: 'Validation failed', fields }, 422);
    },
  })
    .openapi(loginRoute, async (c) => {
      const body = c.req.valid('json');
      const login = body.username ?? body.email;
      if (!login?.trim()) return c.json({ error: 'Validation failed', fields: { username: 'Required' } }, 422) as never;
      const query = c.req.query();
      const seed = intParam(pick(query, 'seed'), DEFAULT_SEED, MAX_SEED);
      const locale = parseLocale(pick(query, 'locale'));
      const all = recordsAt(seed, locale);
      const user = findAccount(all, login);
      if (!user || body.password !== DEMO_PASSWORD) {
        return fail(c, 401, 'invalid_credentials', 'The username or password is wrong.') as never;
      }
      if (!user.active) return disabled(c) as never;
      return (await issue(c, user, all, seed, locale)) as never;
    })
    .openapi(refreshRoute, async (c) => {
      let claims: TokenClaims;
      try {
        claims = await verifyToken(c.req.valid('json').refreshToken, 'refresh');
      } catch (error) {
        if (error instanceof TokenError) return unauthorized(c, error) as never;
        throw error;
      }
      const { all, user } = userFor(claims);
      if (!user) return unauthorized(c, gone) as never;
      if (!user.active) return disabled(c) as never;
      return (await issue(c, user, all, claims.seed, parseLocale(claims.locale))) as never;
    })
    .openapi(meRoute, async (c) => {
      let claims: TokenClaims;
      try {
        claims = await accessClaims(c);
      } catch (error) {
        if (error instanceof TokenError) return unauthorized(c, error) as never;
        throw error;
      }
      const { all, user } = userFor(claims);
      if (!user) return unauthorized(c, gone) as never;
      if (!user.active) return disabled(c) as never;
      contentLanguage(c, parseLocale(claims.locale));
      return c.json({ ...user, role: roleOf(all, user) }) as never;
    })
    .openapi(logoutRoute, (c) => c.body(null, 204));
}
