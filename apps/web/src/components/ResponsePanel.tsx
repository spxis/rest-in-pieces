import { Activity, Check, ChevronLeft, ChevronRight, CircleAlert, Copy, ExternalLink, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RequestResult } from '../hooks/useRequest.ts';
import { extractRows, trimBase } from '../lib/request.ts';
import { DataTable } from './DataTable.tsx';

type Tab = 'table' | 'body' | 'headers';

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
}: {
  apiBase: string;
  result: RequestResult | null;
  error: string;
  sending: boolean;
  copied: string | null;
  pager: Pager | null;
  onCopy: (value: string, key: string) => void;
  onRetry: () => void;
}) {
  const rows = result?.status && result.status < 400 ? extractRows(result.json) : null;
  const [tab, setTab] = useState<Tab>('table');
  const active: Tab = tab === 'table' && !rows ? 'body' : tab;
  useEffect(() => {
    if (result && result.status >= 400) setTab('body');
  }, [result]);

  const total = result?.totalCount ?? null;
  const showPager = pager && total !== null && pager.limit > 0 && result && result.status < 400;
  const page = showPager ? Math.floor(pager.offset / pager.limit) + 1 : 0;
  const pages = showPager ? Math.max(1, Math.ceil(total / pager.limit)) : 0;

  return (
    <section className="response-panel" aria-label="Response inspector" aria-busy={sending}>
      <div className="section-bar response-bar">
        <div className="section-title">
          <span className="step-number">02</span>
          <h2>Response</h2>
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
            {total !== null && <span>{total.toLocaleString()} total</span>}
            <span>{result.contentType}</span>
          </div>
          <div className="response-tabs" role="tablist" aria-label="Response view">
            {rows && (
              <button
                type="button"
                className={active === 'table' ? 'active' : ''}
                onClick={() => setTab('table')}
                role="tab"
                aria-selected={active === 'table'}
              >
                Table <small>{rows.length}</small>
              </button>
            )}
            <button
              type="button"
              className={active === 'body' ? 'active' : ''}
              onClick={() => setTab('body')}
              role="tab"
              aria-selected={active === 'body'}
            >
              Body
            </button>
            <button
              type="button"
              className={active === 'headers' ? 'active' : ''}
              onClick={() => setTab('headers')}
              role="tab"
              aria-selected={active === 'headers'}
            >
              Headers <small>{result.headers.length}</small>
            </button>
          </div>
          {active === 'table' && rows ? (
            <DataTable rows={rows} />
          ) : active === 'body' ? (
            <pre className="response-body">
              <code>{result.body || 'Empty response body'}</code>
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
                  aria-label="Previous results page"
                  disabled={pager.offset === 0 || sending}
                  onClick={() => pager.onPage(Math.max(0, pager.offset - pager.limit))}
                >
                  <ChevronLeft size={14} />
                </button>
                <span>
                  Page {page} of {pages}
                </span>
                <button
                  type="button"
                  aria-label="Next results page"
                  disabled={pager.offset + pager.limit >= total || sending}
                  onClick={() => pager.onPage(pager.offset + pager.limit)}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            ) : (
              <span>RESPONSE BODY</span>
            )}
            <button type="button" onClick={() => onCopy(result.raw, 'body')} title="Copy response body">
              {copied === 'body' ? <Check size={14} /> : <Copy size={14} />}{' '}
              {copied === 'body' ? 'Copied' : 'Copy body'}
            </button>
          </div>
        </>
      ) : (
        <div className="empty-response">
          <div className="empty-icon">{error ? <CircleAlert size={21} /> : <Activity size={21} />}</div>
          <h3>{error ? 'Request could not be completed' : sending ? 'Waiting for the API…' : 'Ready when you are'}</h3>
          <p>{error || 'Configure an endpoint and send a request to inspect the response.'}</p>
          {error ? (
            <button type="button" className="quiet-button retry-button" onClick={onRetry}>
              <Send size={14} /> Try again
            </button>
          ) : (
            <span className="empty-hint">
              <i /> Press <kbd>{/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'}</kbd> + <kbd>Enter</kbd> to
              send
            </span>
          )}
        </div>
      )}
      <div className="response-links">
        <span>
          <span className="green-dot" /> Requests run on demand
        </span>
        <a href={`${trimBase(apiBase)}/openapi.json`} target="_blank" rel="noreferrer">
          OpenAPI spec <ExternalLink size={13} />
        </a>
      </div>
    </section>
  );
}
