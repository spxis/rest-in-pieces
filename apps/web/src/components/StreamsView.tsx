import { Check, CircleAlert, Copy, Play, Radio, RotateCcw, Square } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type StreamState, useStream } from '../hooks/useStream.ts';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import type { PhraseKey } from '../i18n/phrases.ts';
import {
  buildStreamUrl,
  MAX_STREAM_EVENTS,
  STREAM_EVERY,
  STREAM_NAMES,
  type StreamName,
  streamSnippets,
} from '../lib/request.ts';

const STATE_PHRASES: Record<StreamState, PhraseKey> = {
  idle: 'stream.state.idle',
  connecting: 'stream.state.connecting',
  open: 'stream.state.open',
  ended: 'stream.state.ended',
  dropped: 'stream.state.dropped',
  stopped: 'stream.state.stopped',
  failed: 'stream.state.failed',
};

const DESCRIPTIONS: Record<StreamName, PhraseKey> = {
  messages: 'stream.about.messages',
  notifications: 'stream.about.notifications',
  metrics: 'stream.about.metrics',
  logs: 'stream.about.logs',
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, Number.isFinite(value) ? Math.trunc(value) : low));

/** One line of an event's record, for a list: the values only, so a long record stays one line. */
function summary(data: unknown): string {
  if (data === null || typeof data !== 'object') return String(data);
  return Object.entries(data as Record<string, unknown>)
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join('   ');
}

/**
 * The Streams tab: choose a stream, listen, and watch the events arrive as they are sent. It listens with `fetch`, which
 * the API inside this page answers, so it works on the demo as well as against a server. Returns the request panel and the
 * response panel, which fill the two sides of the playground.
 */
export function StreamsView({
  apiBase,
  locale,
  seed,
  copied,
  onCopy,
  tabs,
}: {
  apiBase: string;
  locale: string;
  seed: number;
  copied: string | null;
  onCopy: (value: string, key: string) => void;
  /** The endpoint tabs, drawn at the top of the request panel as on every other tab. */
  tabs: ReactNode;
}) {
  const { say } = useSpeaker();
  const [stream, setStream] = useState<StreamName>('messages');
  const [count, setCount] = useState(10);
  const [every, setEvery] = useState(500);
  const [drop, setDrop] = useState(0);
  const listening = useStream();
  const url = buildStreamUrl(apiBase, { stream, count, every, drop, seed, locale });
  const snippets = streamSnippets(url);
  const busy = listening.state === 'connecting' || listening.state === 'open';
  const log = useRef<HTMLOListElement>(null);

  // The newest event stays in view while the stream flows.
  useEffect(() => {
    const list = log.current;
    if (list && listening.events.length > 0) list.scrollTop = list.scrollHeight;
  }, [listening.events.length]);

  const canResume =
    !busy && listening.lastId !== null && (listening.state === 'dropped' || listening.state === 'stopped');
  const stateName = say(STATE_PHRASES[listening.state]);

  return (
    <>
      <section className="request-panel" aria-label={say('app.builder')}>
        <div className="section-bar">
          <div className="section-title">
            <span className="step-number">01</span>
            <h2>{say('stream.heading')}</h2>
          </div>
        </div>
        {tabs}
        <p className="endpoint-description">{say(DESCRIPTIONS[stream])}</p>
        <div className="form-section">
          <div className="section-label-row">
            <span className="section-caption">{say('stream.setup')}</span>
            <Radio size={15} />
          </div>
          <div className="input-grid">
            <label className="control">
              <span>{say('stream.which')}</span>
              <select
                value={stream}
                disabled={busy}
                onChange={(event) => setStream(event.target.value as StreamName)}
                data-testid="stream-name"
              >
                {STREAM_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="control">
              <span>{say('stream.count')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_STREAM_EVENTS}
                value={count}
                disabled={busy}
                onChange={(event) => setCount(clamp(Number(event.target.value), 1, MAX_STREAM_EVENTS))}
                data-testid="stream-count"
              />
            </label>
            <label className="control">
              <span>{say('stream.every')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={STREAM_EVERY.min}
                max={STREAM_EVERY.max}
                step={100}
                value={every}
                disabled={busy}
                onChange={(event) => setEvery(clamp(Number(event.target.value), STREAM_EVERY.min, STREAM_EVERY.max))}
                data-testid="stream-every"
              />
            </label>
            <label className="control">
              <span>{say('stream.drop')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_STREAM_EVENTS}
                value={drop}
                disabled={busy}
                onChange={(event) => setDrop(clamp(Number(event.target.value), 0, MAX_STREAM_EVENTS))}
                data-testid="stream-drop"
              />
            </label>
          </div>
          <span className="inline-note">{say('stream.dropHint')}</span>
        </div>
        <div className="form-section">
          <div className="section-label-row">
            <span className="section-caption">{say('stream.code')}</span>
          </div>
          <pre className="stream-code" data-testid="stream-code">
            <code>{snippets.javascript}</code>
          </pre>
          <pre className="stream-code">
            <code>{snippets.curl}</code>
          </pre>
          <button type="button" className="quiet-button" onClick={() => onCopy(snippets.javascript, 'stream-js')}>
            {copied === 'stream-js' ? <Check size={14} /> : <Copy size={14} />}{' '}
            {copied === 'stream-js' ? say('common.copied') : say('stream.copyJs')}
          </button>{' '}
          <button type="button" className="quiet-button" onClick={() => onCopy(snippets.curl, 'stream-curl')}>
            {copied === 'stream-curl' ? <Check size={14} /> : <Copy size={14} />}{' '}
            {copied === 'stream-curl' ? say('common.copied') : say('stream.copyCurl')}
          </button>
          <span className="inline-note">{say('stream.eventSourceNote')}</span>
        </div>
        <div className="stream-actions">
          {busy ? (
            <button type="button" className="send-button" onClick={listening.stop} data-testid="stream-stop">
              <Square size={16} /> {say('stream.stop')}
            </button>
          ) : (
            <button
              type="button"
              className="send-button"
              onClick={() => void listening.start(url)}
              data-testid="stream-start"
            >
              <Play size={16} /> {say('stream.start')}
            </button>
          )}
          {canResume && (
            <button
              type="button"
              className="quiet-button strong"
              onClick={() => void listening.start(url, true)}
              data-testid="stream-resume"
            >
              <RotateCcw size={14} /> {say('stream.resume', { id: listening.lastId ?? '' })}
            </button>
          )}
        </div>
      </section>

      <section className="response-panel" aria-label={say('response.label')} aria-busy={busy}>
        <div className="section-bar response-bar">
          <div className="section-title">
            <span className="step-number">02</span>
            <h2>{say('stream.events')}</h2>
          </div>
          <span
            className={
              listening.state === 'failed'
                ? 'status-badge failure'
                : listening.state === 'idle'
                  ? 'status-badge'
                  : 'status-badge success'
            }
            data-testid="stream-state"
            data-state={listening.state}
          >
            <i />
            {stateName}
          </span>
        </div>
        <div className="response-metrics">
          <span data-testid="stream-count-seen">{say('stream.received', { count: listening.count })}</span>
          {listening.lastId !== null && <span>{say('stream.lastId', { id: listening.lastId })}</span>}
        </div>
        {listening.state === 'failed' && listening.problem ? (
          <div className="empty-response" role="alert">
            <div className="empty-icon">
              <CircleAlert size={21} />
            </div>
            <h3>{say('stream.refused')}</h3>
            <p>
              {listening.problem.status ? `${listening.problem.status} ` : ''}
              {listening.problem.message}
            </p>
          </div>
        ) : listening.events.length === 0 ? (
          <div className="empty-response">
            <div className="empty-icon">
              <Radio size={21} />
            </div>
            <h3>{say('stream.readyTitle')}</h3>
            <p>{say('stream.readyHint')}</p>
          </div>
        ) : (
          <ol className="stream-log" ref={log} data-testid="stream-log" aria-live="off">
            {listening.events.map((entry) => (
              <li key={entry.n}>
                <b>#{entry.id}</b>
                <time>{(entry.at / 1000).toFixed(1)} s</time>
                <code title={entry.raw}>{summary(entry.data)}</code>
              </li>
            ))}
          </ol>
        )}
        <div className="response-links">
          <span>
            <span className="green-dot" /> {say('stream.cap')}
          </span>
        </div>
      </section>
    </>
  );
}
