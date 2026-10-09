import {
  CircleAlert,
  Clock,
  Inbox,
  LoaderCircle,
  Lock,
  LogIn,
  RotateCw,
  SearchX,
  ShieldX,
  Trash2,
  Unplug,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useNow } from '../hooks/useAuth.ts';
import type { RequestResult } from '../hooks/useRequest.ts';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import type { PhraseKey } from '../i18n/phrases.ts';
import { cellText } from '../lib/download.ts';

type Row = Record<string, unknown>;

const SHOWN = 6;

/** What a card shows of a record: a title, a line under it, a figure at the side and a picture. */
export function cardOf(row: Row): { title: string; subtitle: string; aside: string; avatar: string | null } {
  const text = (key: string) => (row[key] === null || row[key] === undefined ? '' : cellText(row[key]));
  const title =
    text('name') || [text('firstName'), text('lastName')].filter(Boolean).join(' ') || text('username') || text('sku');
  const subtitle =
    text('email') || text('jobTitle') || text('department') || text('industry') || text('city') || text('alpha3');
  const aside =
    row.price !== undefined && row.price !== null
      ? [text('price'), text('currency')].filter(Boolean).join(' ')
      : text('age') || text('role') || text('employees') || text('alpha2');
  const avatar = typeof row.avatar === 'string' && /^https?:/.test(row.avatar) ? row.avatar : null;
  const fallback = Object.entries(row).find(([key, value]) => key !== 'index' && typeof value === 'string');
  return { title: title || (fallback ? String(fallback[1]) : '—'), subtitle, aside, avatar };
}

const initials = (title: string) =>
  title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('')
    .toUpperCase();

/** A record's picture, or its initials when it has none or the picture does not load (offline, blocked, gone). */
export function Avatar({ src, title, size = 34 }: { src: string | null; title: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new picture deserves a new try
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <span className="preview-initials" style={{ width: size, height: size }} aria-hidden="true">
        {initials(title)}
      </span>
    );
  }
  return <img src={src} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} />;
}

function State({
  icon,
  title,
  detail,
  tone,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail?: string | undefined;
  tone: 'quiet' | 'warning' | 'danger';
  children?: ReactNode;
}) {
  return (
    <div className={`preview-state ${tone}`} role="status">
      <div className="preview-state-icon">{icon}</div>
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {children}
    </div>
  );
}

/** Seconds `Retry-After` asks for, counted down in the tab. */
function useRetryCountdown(result: RequestResult | null): number | null {
  const header = result?.headers.find(([name]) => name === 'retry-after')?.[1];
  const [until, setUntil] = useState<number | null>(null);
  useEffect(() => {
    const seconds = Number(header);
    setUntil(header && Number.isFinite(seconds) ? Date.now() + seconds * 1000 : null);
  }, [header]);
  const now = useNow(until !== null && until > Date.now());
  return until === null ? null : Math.max(0, Math.ceil((until - now) / 1000));
}

const ERRORS: Record<number, [PhraseKey, PhraseKey]> = {
  400: ['ui.badRequest', 'ui.badRequestHint'],
  404: ['ui.notFound', 'ui.notFoundHint'],
  409: ['ui.conflict', 'ui.conflictHint'],
};

/**
 * The response drawn the way an app would draw it: a skeleton while it loads, a card per record, and a
 * proper state for empty results and for each error, so the unhappy paths can be seen, not only read.
 */
export function UiPreview({
  result,
  rows,
  sending,
  error,
  onRetry,
  onSignIn,
}: {
  result: RequestResult | null;
  rows: Row[] | null;
  sending: boolean;
  error: string;
  onRetry: () => void;
  onSignIn: () => void;
}) {
  const { say } = useSpeaker();
  const retryIn = useRetryCountdown(result);
  const retry = (wait = 0) => (
    <button type="button" className="quiet-button" onClick={onRetry} disabled={sending || wait > 0}>
      <RotateCw size={14} /> {wait > 0 ? say('ui.retryIn', { seconds: wait }) : say('response.retry')}
    </button>
  );

  const body = (() => {
    if (sending) {
      return (
        <div
          className="preview-skeleton"
          role="status"
          aria-busy="true"
          aria-label={say('ui.loading')}
          data-testid="ui-loading"
        >
          {Array.from({ length: 4 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <div className="skeleton-row" key={i}>
              <span className="skeleton-avatar" />
              <span className="skeleton-lines">
                <span className="skeleton-line" />
                <span className="skeleton-line short" />
              </span>
            </div>
          ))}
          <p>
            <LoaderCircle className="spin" size={14} /> {say('ui.loading')}
          </p>
        </div>
      );
    }
    if (error) {
      return (
        <State icon={<Unplug size={20} />} title={say('ui.offline')} detail={say('ui.offlineHint')} tone="danger">
          {retry()}
        </State>
      );
    }
    if (!result) return <State icon={<Inbox size={20} />} title={say('response.ready')} tone="quiet" />;
    const { status, json } = result;
    const code = json && typeof json === 'object' && 'code' in json ? String((json as Row).code) : undefined;
    const message = json && typeof json === 'object' && 'message' in json ? String((json as Row).message) : undefined;
    if (status === 401) {
      return (
        <State
          icon={<Lock size={20} />}
          title={say(code === 'token_expired' ? 'ui.expired' : 'ui.signInNeeded')}
          detail={message}
          tone="warning"
        >
          <button type="button" className="quiet-button strong" onClick={onSignIn}>
            <LogIn size={14} /> {say('ui.signInViewer')}
          </button>
        </State>
      );
    }
    if (status === 403) {
      return <State icon={<ShieldX size={20} />} title={say('ui.forbidden')} detail={message} tone="warning" />;
    }
    if (status === 422) {
      const fields = (json as { fields?: Record<string, string> } | null)?.fields ?? {};
      return (
        <State icon={<CircleAlert size={20} />} title={say('ui.invalid')} tone="warning">
          <ul className="preview-fields">
            {Object.entries(fields).map(([field, why]) => (
              <li key={field}>
                <code>{field}</code> {why}
              </li>
            ))}
          </ul>
        </State>
      );
    }
    if (status === 429) {
      return (
        <State icon={<Clock size={20} />} title={say('ui.tooMany')} detail={say('ui.tooManyHint')} tone="warning">
          {retry(retryIn ?? 0)}
        </State>
      );
    }
    if (status >= 500) {
      return (
        <State
          icon={<CircleAlert size={20} />}
          title={say('ui.serverError')}
          detail={say('ui.serverErrorHint')}
          tone="danger"
        >
          {retry(status === 503 ? (retryIn ?? 0) : 0)}
        </State>
      );
    }
    if (status >= 400) {
      const [title, hint] = ERRORS[status] ?? (['ui.failed', 'ui.failedHint'] as [PhraseKey, PhraseKey]);
      return <State icon={<SearchX size={20} />} title={say(title)} detail={say(hint)} tone="warning" />;
    }
    if (status === 204) return <State icon={<Trash2 size={20} />} title={say('ui.deleted')} tone="quiet" />;
    if (!rows)
      return (
        <State icon={<Inbox size={20} />} title={say('ui.noPreview')} detail={say('ui.noPreviewHint')} tone="quiet" />
      );
    if (rows.length === 0) {
      return <State icon={<Inbox size={20} />} title={say('ui.empty')} detail={say('ui.emptyHint')} tone="quiet" />;
    }
    const total = result.totalCount ?? rows.length;
    return (
      <>
        <ul className="preview-cards" data-testid="ui-cards">
          {rows.slice(0, SHOWN).map((row, i) => {
            const card = cardOf(row);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows may share every field, messy ones even the id
              <li key={i}>
                <Avatar src={card.avatar} title={card.title} />
                <span className="preview-text">
                  <strong className="preview-title">{card.title}</strong>
                  {card.subtitle && <span className="preview-subtitle">{card.subtitle}</span>}
                </span>
                {card.aside && <span className="preview-aside">{card.aside}</span>}
              </li>
            );
          })}
        </ul>
        {total > SHOWN && (
          <p className="preview-more">
            {say('ui.more', { count: (total - Math.min(SHOWN, rows.length)).toLocaleString() })}
          </p>
        )}
      </>
    );
  })();

  return (
    <div className="ui-preview" data-testid="ui-preview">
      <div className="ui-preview-frame">
        <div className="ui-preview-bar">
          <i className="preview-bar-dot" />
          <i className="preview-bar-dot" />
          <i className="preview-bar-dot" />
          <span className="preview-bar-title">{say('ui.frameTitle')}</span>
        </div>
        <div className="ui-preview-body">{body}</div>
      </div>
      <p className="inline-note">{say('ui.caption')}</p>
    </div>
  );
}
