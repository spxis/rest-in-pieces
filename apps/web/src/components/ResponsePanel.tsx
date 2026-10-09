import {
  Activity,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  Send,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { REQUEST_FAILED, type RequestResult, UNREACHABLE } from '../hooks/useRequest.ts';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import { DOWNLOAD_FORMATS, downloadOf, saveDownload } from '../lib/download.ts';
import { extractRows, trimBase } from '../lib/request.ts';
import { DataTable } from './DataTable.tsx';
import { UiPreview } from './UiPreview.tsx';

type Tab = 'preview' | 'table' | 'body' | 'headers';

export interface Pager {
  offset: number;
  limit: number;
  onPage: (offset: number) => void;
}

export function ResponsePanel({
  apiBase,
  result,
  error,
  sending,
  copied,
  pager,
  onCopy,
  onRetry,
  onSignIn,
}: {
  apiBase: string;
  result: RequestResult | null;
  error: string;
  sending: boolean;
  copied: string | null;
  pager: Pager | null;
  onCopy: (value: string, key: string) => void;
  onRetry: () => void;
  /** Signs in as a viewer from the preview's 401 state and sends the request again. */
  onSignIn: () => void;
}) {
  const { say, compose } = useSpeaker();
  const errorText = error === UNREACHABLE || error === REQUEST_FAILED ? say(error) : error;
  const rows = result?.status && result.status < 400 ? extractRows(result.json) : null;
  const [tab, setTab] = useState<Tab>('table');
  const active: Tab = tab === 'table' && !rows ? 'body' : tab;
  // An error opens on its body, unless the reader is watching the preview, which draws errors too.
  useEffect(() => {
    if (result && result.status >= 400) setTab((current) => (current === 'preview' ? current : 'body'));
  }, [result]);

  const total = result?.totalCount ?? null;
  const showPager = pager && total !== null && pager.limit > 0 && result && result.status < 400;
  const page = showPager ? Math.floor(pager.offset / pager.limit) + 1 : 0;
  const pages = showPager ? Math.max(1, Math.ceil(total / pager.limit)) : 0;

  return (
    <section className="response-panel" aria-label={say('response.label')} aria-busy={sending}>
      <div className="section-bar response-bar">
        <div className="section-title">
          <span className="step-number">02</span>
          <h2>{say('response.title')}</h2>
        </div>
        {result && (
          <span
            className={result.status < 400 ? 'status-badge success' : 'status-badge failure'}
            data-testid="response-status"
          >
            <i />
            {result.status} {result.statusText}
          </span>
        )}
      </div>
      {result ? (
        <>
          <div className="response-metrics">
            <span>
              <Activity size={14} /> {result.duration} ms
            </span>
            <span>{result.size.toLocaleString()} B</span>
            {total !== null && <span>{say('response.total', { count: total.toLocaleString() })}</span>}
            <span>{result.contentType}</span>
          </div>
          <div className="response-tabs" role="tablist" aria-label={say('response.views')}>
            <button
              type="button"
              className={active === 'preview' ? 'active' : ''}
              onClick={() => setTab('preview')}
              role="tab"
              aria-selected={active === 'preview'}
            >
              {say('response.preview')}
            </button>
            {rows && (
              <button
                type="button"
                className={active === 'table' ? 'active' : ''}
                onClick={() => setTab('table')}
                role="tab"
                aria-selected={active === 'table'}
              >
                {say('response.table')} <small>{rows.length}</small>
              </button>
            )}
            <button
              type="button"
              className={active === 'body' ? 'active' : ''}
              onClick={() => setTab('body')}
              role="tab"
              aria-selected={active === 'body'}
            >
              {say('response.body')}
            </button>
            <button
              type="button"
              className={active === 'headers' ? 'active' : ''}
              onClick={() => setTab('headers')}
              role="tab"
              aria-selected={active === 'headers'}
            >
              {say('response.headers')} <small>{result.headers.length}</small>
            </button>
          </div>
          {active === 'preview' ? (
            <UiPreview
              result={result}
              rows={rows}
              sending={sending}
              error={error}
              onRetry={onRetry}
              onSignIn={onSignIn}
            />
          ) : active === 'table' && rows ? (
            <DataTable rows={rows} />
          ) : active === 'body' ? (
            <pre className="response-body">
              <code>{result.body || say('response.emptyBody')}</code>
            </pre>
          ) : (
            <div className="response-headers">
              {result.headers.map(([name, value]) => (
                <div className="header-row" key={name}>
                  <code>{name}</code>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          )}
          <div className="response-foot">
            {showPager ? (
              <div className="pager">
                <button
                  type="button"
                  aria-label={say('response.previous')}
                  disabled={pager.offset === 0 || sending}
                  onClick={() => pager.onPage(Math.max(0, pager.offset - pager.limit))}
                >
                  <ChevronLeft size={14} />
                </button>
                <span>{say('response.page', { page, pages })}</span>
                <button
                  type="button"
                  aria-label={say('response.next')}
                  disabled={pager.offset + pager.limit >= total || sending}
                  onClick={() => pager.onPage(pager.offset + pager.limit)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            ) : (
              <span>{say('response.bodyCaption')}</span>
            )}
            <div className="foot-actions">
              <fieldset className="download-group">
                <legend>
                  <Download size={13} /> {say('response.download')}
                </legend>
                {DOWNLOAD_FORMATS.map((format) => {
                  const file = downloadOf({ ...result, rows }, format);
                  return (
                    <button
                      type="button"
                      key={format}
                      disabled={!file}
                      title={file ? say('response.downloadAs', { file: file.filename }) : say('response.downloadNone')}
                      onClick={() => file && saveDownload(file)}
                    >
                      {format.toUpperCase()}
                    </button>
                  );
                })}
              </fieldset>
              <button type="button" onClick={() => onCopy(result.raw, 'body')} title={say('response.copyBodyTitle')}>
                {copied === 'body' ? <Check size={14} /> : <Copy size={14} />}{' '}
                {copied === 'body' ? say('common.copied') : say('response.copyBody')}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-response">
          <div className="empty-icon">{error ? <CircleAlert size={21} /> : <Activity size={21} />}</div>
          <h3>{say(error ? 'response.failed' : sending ? 'response.waiting' : 'response.ready')}</h3>
          <p>{errorText || say('response.readyHint')}</p>
          {error ? (
            <button type="button" className="quiet-button retry-button" onClick={onRetry}>
              <Send size={14} /> {say('response.retry')}
            </button>
          ) : (
            <span className="empty-hint">
              <i />{' '}
              {compose('response.shortcut', {
                keys: (
                  <>
                    <kbd>{/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'}</kbd> + <kbd>Enter</kbd>
                  </>
                ),
              })}
            </span>
          )}
        </div>
      )}
      <div className="response-links">
        <span>
          <span className="green-dot" /> {say('response.onDemand')}
        </span>
        <a href={`${trimBase(apiBase)}/openapi.json`} target="_blank" rel="noreferrer">
          {say('response.openapi')} <ExternalLink size={13} />
        </a>
      </div>
    </section>
  );
}
