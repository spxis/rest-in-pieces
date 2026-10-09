import { Database, RotateCcw } from 'lucide-react';
import type { SessionState } from '../hooks/useSession.ts';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';

/**
 * What the API keeps of the writes sent to it. On the hosted demo the API runs in this tab and the
 * panel can switch keeping on for the tab; a server keeps writes only when it was started with
 * `--session`, which the panel says rather than pretends.
 */
export function SessionPanel({ session }: { session: SessionState }) {
  const { say } = useSpeaker();
  const { summary } = session;
  const keeping = summary?.enabled === true;
  const changes = summary?.datasets ?? [];

  return (
    <details
      className="simulation-details panel-details session-panel"
      open={keeping || undefined}
      data-testid="session-panel"
    >
      <summary>
        {say('session.heading')}{' '}
        <span>{keeping ? say('session.on', { count: changes.length }) : say('session.off')}</span>
      </summary>

      {session.switchable ? (
        <label className="check-control">
          <input
            type="checkbox"
            checked={session.keepInTab}
            onChange={(event) => void session.setKeep(event.target.checked)}
          />
          <span>{say('session.keepInTab')}</span>
        </label>
      ) : null}

      <p className="inline-note">
        {session.state === 'unsupported'
          ? say('session.unsupported')
          : session.state === 'offline'
            ? say('session.offline')
            : keeping
              ? say(session.switchable ? 'session.onInTab' : 'session.onServer')
              : say(session.switchable ? 'session.offInTab' : 'session.offServer')}
      </p>

      {keeping && (
        <>
          {changes.length === 0 ? (
            <p className="session-empty">{say('session.nothingYet')}</p>
          ) : (
            <ul className="session-list" data-testid="session-list">
              {changes.map((change) => (
                <li key={`${change.dataset}:${change.locale}:${change.seed}`}>
                  <Database size={14} />
                  <code>
                    /{change.dataset}
                    {change.seed !== 1 ? ` seed=${change.seed}` : ''}
                    {change.locale !== 'en-CA' ? ` locale=${change.locale}` : ''}
                  </code>
                  <span className="session-counts">
                    <b className="added">+{change.created}</b> <b className="changed">~{change.updated}</b>{' '}
                    <b className="removed">−{change.deleted}</b>
                  </span>
                  <span className="session-total">{say('session.records', { count: change.records })}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="inline-note">
            {say('session.limits', {
              records: summary?.limits.records ?? 0,
              datasets: summary?.limits.datasets ?? 0,
              megabytes: Math.round((summary?.limits.bytes ?? 0) / 1024 / 1024),
            })}
          </p>
          <div className="panel-actions">
            <button type="button" className="quiet-button strong" onClick={() => void session.reset()}>
              <RotateCcw size={14} /> {say('session.reset')}
            </button>
          </div>
        </>
      )}
    </details>
  );
}
