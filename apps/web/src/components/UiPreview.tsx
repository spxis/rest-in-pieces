import { avatarSvg, placeholderSvg, svgDataUrl } from '@johnmorrisdotca/rest-in-pieces/images';
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

const STARS = (rating: number) => '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));

/** What a card shows of a record: a title, a line under it, a figure at the side and a picture. */
export function cardOf(row: Row): {
  title: string;
  subtitle: string;
  aside: string;
  avatar: string | null;
  /** A thing rather than a person: drawn as a square placeholder, not a round avatar. */
  thing: boolean;
  /** Whose initials the avatar shows, when that is not the title: a comment's author, an embedded user. */
  person?: string;
} {
  const text = (key: string) => (row[key] === null || row[key] === undefined ? '' : cellText(row[key]));
  const firstLine = (key: string) => text(key).split('\n')[0] ?? '';
  const picture = (value: unknown) => (typeof value === 'string' && /^https?:/.test(value) ? value : null);
  const avatar = picture(row.avatar);
  // An embedded user (`expand=user`) is who a review, comment, post or todo is by.
  const by = row.user && typeof row.user === 'object' ? (row.user as Row) : null;
  const byName = by ? [by.firstName, by.lastName].filter((part) => typeof part === 'string').join(' ') : '';
  const author = by ? { avatar: picture(by.avatar), ...(byName ? { person: byName } : {}) } : null;
  // Orders, posts, comments, todos and reviews say what they are about rather than who they are.
  if (Array.isArray(row.items) && 'orderStatus' in row) {
    const count = Number(row.itemCount ?? row.items.length);
    return {
      title: `#${text('id')} · ${text('orderStatus')}`,
      subtitle: `${count} × ${row.items.map((item) => cellText((item as Row)?.name)).join(', ')}`,
      aside: [text('total'), text('currency')].filter(Boolean).join(' '),
      avatar: null,
      thing: true,
    };
  }
  if ('rating' in row && 'productId' in row) {
    return {
      title: text('title'),
      subtitle: firstLine('body'),
      aside: STARS(Number(row.rating) || 0),
      avatar: null,
      thing: !author,
      ...author,
    };
  }
  if ('postId' in row && 'email' in row) {
    return { title: text('name'), subtitle: firstLine('body'), aside: '', avatar: null, thing: false, ...author };
  }
  if ('completed' in row && 'title' in row) {
    return {
      title: text('title'),
      subtitle: text('dueOn'),
      aside: row.completed === true ? '✓' : '—',
      avatar: null,
      thing: !author,
      ...author,
    };
  }
  if ('title' in row && 'body' in row) {
    return {
      title: text('title'),
      subtitle: firstLine('body'),
      aside: `#${text('id')}`,
      avatar: null,
      thing: !author,
      ...author,
    };
  }
  // Synthetic FHIR resources: a record says what it is, and is shown by what a clinician would look at first.
  if (row.resourceType === 'Patient') {
    const name = Array.isArray(row.name) ? ((row.name[0] as Row | undefined)?.text ?? '') : '';
    return {
      title: cellText(name) || `Patient ${text('id')}`,
      subtitle: [text('gender'), text('birthDate') && `born ${text('birthDate')}`].filter(Boolean).join(' · '),
      aside: `#${text('id')}`,
      avatar: null,
      thing: false,
      person: cellText(name),
    };
  }
  if (row.resourceType === 'Observation' || row.resourceType === 'Condition' || row.resourceType === 'Encounter') {
    const concept = (key: string) => {
      const value = row[key] as Row | Row[] | undefined;
      const first = Array.isArray(value) ? value[0] : value;
      return cellText((first as Row | undefined)?.text ?? '');
    };
    const subject = cellText((row.subject as Row | undefined)?.reference ?? '');
    if (row.resourceType === 'Observation') {
      const quantity = (row.valueQuantity ?? {}) as Row;
      return {
        title: concept('code'),
        subtitle: [subject, text('effectiveDateTime').slice(0, 10)].filter(Boolean).join(' · '),
        aside: [cellText(quantity.value ?? ''), cellText(quantity.unit ?? '')].filter(Boolean).join(' '),
        avatar: null,
        thing: true,
      };
    }
    if (row.resourceType === 'Condition') {
      const status = ((row.clinicalStatus as Row | undefined)?.coding as Row[] | undefined)?.[0]?.code;
      return {
        title: concept('code'),
        subtitle: [subject, text('onsetDateTime').slice(0, 10)].filter(Boolean).join(' · '),
        aside: cellText(status ?? ''),
        avatar: null,
        thing: true,
      };
    }
    return {
      title: concept('type'),
      subtitle: [subject, text('status'), cellText(((row.period ?? {}) as Row).start ?? '').slice(0, 10)]
        .filter(Boolean)
        .join(' · '),
      aside: cellText((row.class as Row | undefined)?.code ?? ''),
      avatar: null,
      thing: true,
    };
  }
  if ('invoiceStatus' in row) {
    return {
      title: [text('number'), text('customer')].filter(Boolean).join(' · '),
      subtitle: text('invoiceStatus'),
      aside: [text('total'), text('currency')].filter(Boolean).join(' '),
      avatar: null,
      thing: true,
    };
  }
  if ('transactionStatus' in row) {
    return {
      title: text('counterparty'),
      subtitle: [text('category'), text('occurredAt').slice(0, 10)].filter(Boolean).join(' · '),
      aside: [text('amount'), text('currency')].filter(Boolean).join(' '),
      avatar: null,
      thing: true,
    };
  }
  if ('eventStatus' in row) {
    return {
      title: text('title'),
      subtitle: text('startsAt').slice(0, 16).replace('T', ' '),
      aside: text('category'),
      avatar: null,
      thing: true,
    };
  }
  if ('fromEmail' in row) {
    return {
      title: text('subject'),
      subtitle: [text('fromName'), text('toName')].filter(Boolean).join(' → '),
      aside: row.read === true ? '' : '●',
      avatar: null,
      thing: false,
      person: text('fromName'),
    };
  }
  if ('actionPath' in row) {
    return { title: text('title'), subtitle: firstLine('body'), aside: text('type'), avatar: null, thing: true };
  }
  if ('jobStatus' in row) {
    return {
      title: text('title'),
      subtitle: [text('company'), text('city')].filter(Boolean).join(' · '),
      aside: `${text('salaryMin')}–${text('salaryMax')} ${text('currency')}`.trim(),
      avatar: null,
      thing: true,
    };
  }
  if ('geometry' in row) {
    return {
      title: text('name'),
      subtitle: [text('category'), `${text('distanceKm')} km`].join(' · '),
      aside: STARS(Math.round(Number(row.rating) || 0)),
      avatar: null,
      thing: true,
    };
  }
  if ('cpuPercent' in row) {
    return {
      title: text('timestamp').slice(0, 16).replace('T', ' '),
      subtitle: [text('host'), `${text('latencyMs')} ms`].join(' · '),
      aside: `${text('cpuPercent')}% CPU`,
      avatar: null,
      thing: true,
    };
  }
  if ('traceId' in row) {
    return {
      title: text('message'),
      subtitle: [text('service'), text('level')].join(' · '),
      aside: text('statusCode'),
      avatar: null,
      thing: true,
    };
  }
  const title =
    text('name') || [text('firstName'), text('lastName')].filter(Boolean).join(' ') || text('username') || text('sku');
  const subtitle =
    text('email') || text('jobTitle') || text('department') || text('industry') || text('city') || text('alpha3');
  const aside =
    row.price !== undefined && row.price !== null
      ? [text('price'), text('currency')].filter(Boolean).join(' ')
      : text('age') || text('role') || text('employees') || text('alpha2');
  const fallback = Object.entries(row).find(([key, value]) => key !== 'index' && typeof value === 'string');
  const thing = 'sku' in row || 'alpha2' in row || 'industry' in row;
  return { title: title || (fallback ? String(fallback[1]) : '—'), subtitle, aside, avatar, thing };
}

/**
 * An avatar this API serves (`…/avatars/{seed}.svg?name=…`), drawn here by the same function instead of fetched,
 * so it shows on GitHub Pages, where the API lives in the tab and an `<img>` cannot reach it, and offline.
 */
export function localAvatar(src: string | null): string | null {
  if (!src) return null;
  try {
    const url = new URL(src);
    const match = /\/avatars\/([^/]+)\.svg$/.exec(url.pathname);
    if (!match) return null;
    return svgDataUrl(avatarSvg(decodeURIComponent(match[1] ?? ''), url.searchParams.get('name') ?? undefined));
  } catch {
    return null;
  }
}

/**
 * A record's picture: an avatar this API serves, drawn in the page; any other picture, when it loads; and
 * otherwise a generated avatar with the title's initials, or a placeholder for a thing.
 */
export function Avatar({
  src,
  title,
  size = 34,
  thing = false,
}: {
  src: string | null;
  title: string;
  size?: number;
  thing?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new picture deserves a new try
  useEffect(() => setFailed(false), [src]);
  const local = localAvatar(src);
  const drawn = thing
    ? svgDataUrl(placeholderSvg(64, 64, { text: [...title.trim()].slice(0, 2).join('') || '?' }))
    : svgDataUrl(avatarSvg(title || '?', title));
  const picture = local ?? (src && !failed ? src : drawn);
  return (
    <img
      className={thing ? 'preview-picture square' : 'preview-picture'}
      src={picture}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
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
                <Avatar src={card.avatar} title={card.person ?? card.title} thing={card.thing} />
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
