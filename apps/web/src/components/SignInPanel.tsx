import { KeyRound, LogIn, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ACCOUNTS, type Account, type AuthState, LIFETIMES, type Lifetime, useNow } from '../hooks/useAuth.ts';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import type { PhraseKey } from '../i18n/phrases.ts';
import { AUTH_REQUIREMENTS, type AuthRequirement, type PlaygroundConfig } from '../lib/config.ts';
import { Avatar } from './UiPreview.tsx';

const ACCOUNT_LABELS: Record<Account, PhraseKey> = {
  admin: 'auth.account.admin',
  editor: 'auth.account.editor',
  viewer: 'auth.account.viewer',
  disabled: 'auth.account.disabled',
  wrong: 'auth.account.wrong',
};
const LIFETIME_LABELS: Record<Lifetime, PhraseKey> = {
  '15m': 'auth.lifetime.default',
  '30s': 'auth.lifetime.short',
  '0': 'auth.lifetime.expired',
};
const REQUIREMENT_LABELS: Record<AuthRequirement, PhraseKey> = {
  '': 'auth.require.none',
  required: 'auth.require.any',
  editor: 'auth.require.editor',
  admin: 'auth.require.admin',
};

/** `m:ss` left on a token, or null once it has expired. */
export function timeLeft(expiresAt: number, now: number): string | null {
  const seconds = Math.ceil((expiresAt - now) / 1000);
  if (seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Fake sign-in: pick an account and a token lifetime, sign in, and every request the playground sends
 * carries the token. The requirement select turns the request into a protected route with `?auth=`.
 */
export function SignInPanel({
  auth,
  config,
  onChange,
}: {
  auth: AuthState;
  config: PlaygroundConfig;
  onChange: (patch: Partial<PlaygroundConfig>) => void;
}) {
  const { say } = useSpeaker();
  const [account, setAccount] = useState<Account>('viewer');
  const [lifetime, setLifetime] = useState<Lifetime>('15m');
  const now = useNow(auth.expiresAt !== null);
  const left = auth.expiresAt === null ? null : timeLeft(auth.expiresAt, now);
  const active = auth.user !== null || config.auth !== '';
  const { answer } = auth;

  return (
    <details
      className="simulation-details panel-details auth-panel"
      open={active || undefined}
      data-testid="sign-in-panel"
    >
      <summary>
        {say('auth.heading')}{' '}
        <span>{auth.user ? say('auth.signedInShort', { role: auth.user.role }) : say('simulate.optional')}</span>
      </summary>
      <p className="inline-note">{say('auth.notSecurity')}</p>

      <label className="control">
        <span>{say('auth.require')}</span>
        <select
          value={config.auth}
          onChange={(event) => onChange({ auth: event.target.value as AuthRequirement })}
          aria-describedby="auth-require-hint"
        >
          {AUTH_REQUIREMENTS.map((value) => (
            <option key={value} value={value}>
              {say(REQUIREMENT_LABELS[value])}
            </option>
          ))}
        </select>
      </label>
      <p className="inline-note" id="auth-require-hint">
        {say('auth.requireHint')}
      </p>

      {auth.user ? (
        <div className="signed-in-card" data-testid="signed-in">
          <Avatar
            src={typeof auth.user.avatar === 'string' ? auth.user.avatar : null}
            title={`${auth.user.firstName} ${auth.user.lastName}`}
            size={36}
          />
          <div className="signed-in-who">
            <strong>
              {auth.user.firstName} {auth.user.lastName}
            </strong>
            <span className="signed-in-email">{auth.user.email}</span>
          </div>
          <span className={`role-badge role-${auth.user.role}`}>{auth.user.role}</span>
          <span className={left ? 'token-clock' : 'token-clock expired'} data-testid="token-clock">
            <KeyRound size={13} /> {left ? say('auth.expiresIn', { time: left }) : say('auth.expired')}
          </span>
        </div>
      ) : (
        <div className="sign-in-grid">
          <label className="control">
            <span>{say('auth.account')}</span>
            <select value={account} onChange={(event) => setAccount(event.target.value as Account)}>
              {ACCOUNTS.map((value) => (
                <option key={value} value={value}>
                  {say(ACCOUNT_LABELS[value])}
                </option>
              ))}
            </select>
          </label>
          <label className="control">
            <span>{say('auth.lifetime')}</span>
            <select value={lifetime} onChange={(event) => setLifetime(event.target.value as Lifetime)}>
              {LIFETIMES.map((value) => (
                <option key={value} value={value}>
                  {say(LIFETIME_LABELS[value])}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="panel-actions">
        {auth.user ? (
          <>
            <button type="button" className="quiet-button" disabled={auth.busy} onClick={() => void auth.checkMe()}>
              <ShieldCheck size={14} /> {say('auth.checkMe')}
            </button>
            <button type="button" className="quiet-button" disabled={auth.busy} onClick={() => void auth.refresh()}>
              <RefreshCw size={14} /> {say('auth.refresh')}
            </button>
            <button type="button" className="quiet-button" disabled={auth.busy} onClick={() => void auth.signOut()}>
              <LogOut size={14} /> {say('auth.signOut')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="quiet-button strong"
            disabled={auth.busy}
            onClick={() => void auth.signIn(account, lifetime, { seed: config.seed, locale: config.locale })}
          >
            <LogIn size={14} /> {say('auth.signIn')}
          </button>
        )}
      </div>

      {answer && (
        <p
          className={answer.status >= 200 && answer.status < 300 ? 'auth-answer ok' : 'auth-answer failed'}
          data-testid="auth-answer"
          aria-live="polite"
        >
          <code>
            {answer.action === 'login'
              ? 'POST /auth/login'
              : answer.action === 'me'
                ? 'GET /auth/me'
                : answer.action === 'refresh'
                  ? 'POST /auth/refresh'
                  : 'POST /auth/logout'}
          </code>{' '}
          <b>{answer.status || '—'}</b>
          {answer.code && <code>{answer.code}</code>}
          {answer.status === 0 ? ` ${say('response.unreachable')}` : answer.message ? ` ${answer.message}` : ''}
        </p>
      )}

      {auth.claims && (
        <details className="token-claims">
          <summary>{say('auth.claims')}</summary>
          <pre>
            <code>{JSON.stringify(auth.claims, null, 2)}</code>
          </pre>
        </details>
      )}
    </details>
  );
}
