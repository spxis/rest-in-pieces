import {
  Activity,
  ArrowUpDown,
  Braces,
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Plus,
  Send,
  Trash2,
  Workflow,
} from 'lucide-react';
import { useRef, useState } from 'react';

type Endpoint = 'names' | 'countries' | 'generate';
type OutputFormat = 'json' | 'csv' | 'yaml' | 'xml';
type ResultTab = 'body' | 'headers';
type Field = { id: number; name: string; type: string };
type RequestResult = {
  status: number;
  statusText: string;
  duration: number;
  size: number;
  contentType: string;
  body: string;
  headers: Array<[string, string]>;
};

const DEFAULT_API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:6800';
const DEFAULT_GENERATORS = ['person.fullName', 'internet.email'];
const NAME_FIELDS = ['index', 'name', 'age', 'city', 'province', 'country', 'gender'];

function apiPath(endpoint: Endpoint): string {
  if (endpoint === 'generate') return '/generate';
  return `/${endpoint}`;
}

function mimeFor(format: OutputFormat): string {
  if (format === 'csv') return 'text/csv';
  if (format === 'yaml') return 'application/yaml';
  if (format === 'xml') return 'application/xml';
  return 'application/json';
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export default function App() {
  const [endpoint, setEndpoint] = useState<Endpoint>('names');
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [max, setMax] = useState(1000);
  const [seed, setSeed] = useState(1);
  const [sortBy, setSortBy] = useState('');
  const [sortType, setSortType] = useState<'string' | 'numeric'>('string');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [format, setFormat] = useState<OutputFormat>('json');
  const [metadata, setMetadata] = useState(true);
  const [delay, setDelay] = useState(0);
  const [status, setStatus] = useState(500);
  const [fail, setFail] = useState(false);
  const [fields, setFields] = useState<Field[]>([
    { id: 1, name: 'name', type: 'person.fullName' },
    { id: 2, name: 'email', type: 'internet.email' },
  ]);
  const [generatorTypes, setGeneratorTypes] = useState<string[]>(DEFAULT_GENERATORS);
  const [generatorState, setGeneratorState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const generatorRequest = useRef<Promise<void> | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<RequestResult | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ResultTab>('body');
  const [copied, setCopied] = useState<'url' | 'curl' | 'body' | null>(null);

  const openEndpoint = (next: Endpoint) => {
    setEndpoint(next);
    setOffset(0);
    if (next !== 'generate' || generatorRequest.current) return;

    setGeneratorState('loading');
    generatorRequest.current = fetch(`${apiBase.replace(/\/+$/, '')}/generators`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load generator types');
        const body = (await response.json()) as { generators?: unknown };
        if (!Array.isArray(body.generators) || !body.generators.every((value) => typeof value === 'string')) {
          throw new Error('The generator catalog response was invalid');
        }
        setGeneratorTypes(body.generators);
        setGeneratorState('ready');
      })
      .catch(() => setGeneratorState('error'));
  };

  const buildRequest = () => {
    const base = apiBase.trim().replace(/\/+$/, '');
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (endpoint !== 'countries') {
      params.set('seed', String(seed));
      params.set('max', String(max));
      if (sortBy) params.set('sortBy', `${sortBy}${sortType === 'numeric' ? ':numeric' : ''}`);
      if (sortBy) params.set('sortDirection', sortDirection);
    }
    if (endpoint === 'names' && !metadata) params.set('metadata', 'false');
    if (endpoint === 'generate') {
      params.set('fields', fields.map((field) => `${field.name}:${field.type}`).join(','));
    }
    if (format !== 'json') params.set('format', format);
    if (delay > 0) params.set('delay', String(delay));
    if (fail) {
      params.set('fail', 'true');
      params.set('status', String(status));
    }
    return { url: `${base}${apiPath(endpoint)}?${params.toString()}`, parameterCount: params.size };
  };

  const { url, parameterCount } = buildRequest();
  const curlCommand = `curl -i -H ${shellQuote(`Accept: ${mimeFor(format)}`)} ${shellQuote(url)}`;

  const sendRequest = async () => {
    setSending(true);
    setError('');
    setResult(null);
    setCopied(null);
    const started = performance.now();
    try {
      const response = await fetch(url, { headers: { Accept: mimeFor(format) } });
      const bodyText = await response.text();
      let body = bodyText;
      if (response.headers.get('content-type')?.includes('json')) {
        try {
          body = JSON.stringify(JSON.parse(bodyText), null, 2);
        } catch {
          body = bodyText;
        }
      }
      setResult({
        status: response.status,
        statusText: response.statusText,
        duration: Math.round(performance.now() - started),
        size: new TextEncoder().encode(bodyText).length,
        contentType: response.headers.get('content-type') || 'unknown',
        body,
        headers: [...response.headers.entries()].sort(([a], [b]) => a.localeCompare(b)),
      });
      setActiveTab('body');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Request failed');
    } finally {
      setSending(false);
    }
  };

  const copy = async (value: string, kind: 'url' | 'curl' | 'body') => {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
  };

  const updateField = (id: number, update: Partial<Field>) => {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...update } : field)));
  };

  const addField = () => {
    const id = Math.max(0, ...fields.map((field) => field.id)) + 1;
    setFields((current) => [...current, { id, name: `field${id}`, type: generatorTypes[0] || 'person.fullName' }]);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="REST in Pieces home">
          <span className="brand-mark">
            <Workflow size={19} strokeWidth={2.2} />
          </span>
          <span>
            REST <b>in</b> Pieces
          </span>
        </a>
        <div className="topbar-right">
          <span className="environment">
            <i /> LOCAL API
          </span>
          <a className="docs-link" href={`${apiBase.replace(/\/+$/, '')}/docs`} target="_blank" rel="noreferrer">
            API docs <ExternalLink size={14} />
          </a>
        </div>
      </header>

      <main className="workspace">
        <section className="page-heading">
          <div>
            <p className="eyebrow">
              <span>DEVELOPER TOOL</span>
              <span className="eyebrow-line" />
            </p>
            <h1>API Playground</h1>
            <p className="intro">Shape a request. See exactly what comes back.</p>
          </div>
          <div className="api-address">
            <label htmlFor="api-base">API BASE URL</label>
            <input
              id="api-base"
              value={apiBase}
              onChange={(event) => setApiBase(event.target.value)}
              spellCheck={false}
            />
          </div>
        </section>

        <div className="playground-grid">
          <section className="request-panel" aria-label="Request builder">
            <div className="section-bar">
              <div className="section-title">
                <span className="step-number">01</span>
                <h2>Build request</h2>
              </div>
              <span className="method-tag">GET</span>
            </div>

            <div className="endpoint-tabs" role="tablist" aria-label="API endpoint">
              <button
                type="button"
                className={endpoint === 'names' ? 'endpoint-tab active' : 'endpoint-tab'}
                onClick={() => openEndpoint('names')}
                role="tab"
                aria-selected={endpoint === 'names'}
              >
                <Activity size={15} /> Names
              </button>
              <button
                type="button"
                className={endpoint === 'countries' ? 'endpoint-tab active' : 'endpoint-tab'}
                onClick={() => openEndpoint('countries')}
                role="tab"
                aria-selected={endpoint === 'countries'}
              >
                <Globe2 size={15} /> Countries
              </button>
              <button
                type="button"
                className={endpoint === 'generate' ? 'endpoint-tab active' : 'endpoint-tab'}
                onClick={() => openEndpoint('generate')}
                role="tab"
                aria-selected={endpoint === 'generate'}
              >
                <Braces size={15} /> Generate
              </button>
            </div>

            {endpoint === 'generate' && (
              <div className="form-section fields-section">
                <div className="field-heading">
                  <div>
                    <span className="section-caption">RECORD FIELDS</span>
                    <span className="field-count">{fields.length} / 50</span>
                  </div>
                  <button type="button" className="small-command" onClick={addField} disabled={fields.length >= 50}>
                    <Plus size={14} /> Add field
                  </button>
                </div>
                <div className="field-list">
                  {fields.map((field) => (
                    <div className="field-row" key={field.id}>
                      <input
                        aria-label="Field name"
                        value={field.name}
                        onChange={(event) => updateField(field.id, { name: event.target.value })}
                      />
                      <select
                        aria-label="Generator type"
                        value={field.type}
                        onChange={(event) => updateField(field.id, { type: event.target.value })}
                      >
                        {generatorTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="icon-button remove-field"
                        title="Remove field"
                        aria-label="Remove field"
                        onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}
                        disabled={fields.length === 1}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                {generatorState === 'loading' && <span className="inline-note">Loading generator types…</span>}
                {generatorState === 'error' && (
                  <span className="inline-note warning">
                    Showing the starter field types; the API catalog could not be reached.
                  </span>
                )}
              </div>
            )}

            <div className="form-section">
              <div className="section-label-row">
                <span className="section-caption">PAGE &amp; SORT</span>
                <ArrowUpDown size={15} />
              </div>
              <div className="input-grid three-cols">
                <label className="control">
                  <span>Limit</span>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={limit}
                    onChange={(event) => setLimit(Number(event.target.value))}
                  />
                </label>
                <label className="control">
                  <span>Offset</span>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={offset}
                    onChange={(event) => setOffset(Number(event.target.value))}
                  />
                </label>
                {endpoint !== 'countries' && (
                  <label className="control">
                    <span>Dataset max</span>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={max}
                      onChange={(event) => setMax(Number(event.target.value))}
                    />
                  </label>
                )}
              </div>
              {endpoint !== 'countries' && (
                <div className="input-grid sort-grid">
                  <label className="control">
                    <span>Sort field</span>
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                      <option value="">Default order</option>
                      {(endpoint === 'names' ? NAME_FIELDS : fields.map((field) => field.name)).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="control">
                    <span>Compare as</span>
                    <select
                      value={sortType}
                      onChange={(event) => setSortType(event.target.value as 'string' | 'numeric')}
                    >
                      <option value="string">Text</option>
                      <option value="numeric">Number</option>
                    </select>
                  </label>
                  <label className="control">
                    <span>Direction</span>
                    <select
                      value={sortDirection}
                      onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}
                    >
                      <option value="asc">Ascending</option>
                      <option value="desc">Descending</option>
                    </select>
                  </label>
                </div>
              )}
              {endpoint !== 'countries' && (
                <label className="control seed-control">
                  <span>Seed</span>
                  <input
                    type="number"
                    min="0"
                    max="4294967295"
                    value={seed}
                    onChange={(event) => setSeed(Number(event.target.value))}
                  />
                  <span className="control-hint">Same seed, same dataset</span>
                </label>
              )}
              {endpoint === 'names' && (
                <label className="check-control">
                  <input type="checkbox" checked={metadata} onChange={(event) => setMetadata(event.target.checked)} />
                  <span>Include response metadata</span>
                </label>
              )}
            </div>

            <div className="form-section output-section">
              <div className="section-label-row">
                <span className="section-caption">RESPONSE</span>
                <span>Content negotiation</span>
              </div>
              <fieldset className="format-fieldset">
                <legend className="sr-only">Response format</legend>
                <div className="format-options">
                  {(['json', 'csv', 'yaml', 'xml'] as const).map((option) => (
                    <button
                      type="button"
                      key={option}
                      className={format === option ? 'format-option active' : 'format-option'}
                      onClick={() => setFormat(option)}
                    >
                      {option.toUpperCase()}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <details className="simulation-details">
              <summary>
                SIMULATE A RESPONSE <span>Optional</span>
              </summary>
              <div className="simulation-grid">
                <label className="control">
                  <span>Delay (ms)</span>
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={delay}
                    onChange={(event) => setDelay(Number(event.target.value))}
                  />
                </label>
                <label className="control">
                  <span>Failure status</span>
                  <select value={status} onChange={(event) => setStatus(Number(event.target.value))}>
                    <option value={400}>400 Bad Request</option>
                    <option value={404}>404 Not Found</option>
                    <option value={429}>429 Too Many Requests</option>
                    <option value={500}>500 Internal Server Error</option>
                    <option value={503}>503 Service Unavailable</option>
                  </select>
                </label>
                <label className="check-control failure-toggle">
                  <input type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} />
                  <span>Return simulated failure</span>
                </label>
              </div>
            </details>

            <div className="request-preview">
              <div className="preview-heading">
                <span>REQUEST URL</span>
                <span>{parameterCount} params</span>
              </div>
              <code>{url}</code>
              <div className="preview-actions">
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => void copy(url, 'url')}
                  title="Copy request URL"
                >
                  {copied === 'url' ? <Check size={14} /> : <Copy size={14} />}
                  {copied === 'url' ? 'Copied' : 'Copy URL'}
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => void copy(curlCommand, 'curl')}
                  title="Copy curl command"
                >
                  {copied === 'curl' ? <Check size={14} /> : <Copy size={14} />}
                  {copied === 'curl' ? 'Copied' : 'Copy curl'}
                </button>
              </div>
            </div>

            <button
              type="button"
              className="send-button"
              onClick={() => void sendRequest()}
              disabled={sending || (endpoint === 'generate' && fields.some((field) => !field.name.trim()))}
            >
              {sending ? <LoaderCircle className="spin" size={17} /> : <Send size={16} />}
              {sending ? 'Sending request' : 'Send request'}
              {!sending && <span>↵</span>}
            </button>
          </section>

          <section className="response-panel" aria-label="Response inspector">
            <div className="section-bar response-bar">
              <div className="section-title">
                <span className="step-number">02</span>
                <h2>Response</h2>
              </div>
              {result && (
                <span className={result.status < 400 ? 'status-badge success' : 'status-badge failure'}>
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
                  <span>{result.contentType}</span>
                </div>
                <div className="response-tabs" role="tablist" aria-label="Response view">
                  <button
                    type="button"
                    className={activeTab === 'body' ? 'active' : ''}
                    onClick={() => setActiveTab('body')}
                    role="tab"
                    aria-selected={activeTab === 'body'}
                  >
                    Body
                  </button>
                  <button
                    type="button"
                    className={activeTab === 'headers' ? 'active' : ''}
                    onClick={() => setActiveTab('headers')}
                    role="tab"
                    aria-selected={activeTab === 'headers'}
                  >
                    Headers <small>{result.headers.length}</small>
                  </button>
                </div>
                {activeTab === 'body' ? (
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
                  <span>RESPONSE BODY</span>
                  <button type="button" onClick={() => void copy(result.body, 'body')} title="Copy response body">
                    {copied === 'body' ? <Check size={14} /> : <Copy size={14} />}{' '}
                    {copied === 'body' ? 'Copied' : 'Copy body'}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-response">
                <div className="empty-icon">{error ? <CircleAlert size={21} /> : <Activity size={21} />}</div>
                <h3>{error ? 'Request could not be completed' : 'Ready when you are'}</h3>
                <p>{error || 'Configure an endpoint and send a request to inspect the response.'}</p>
                {error && (
                  <button type="button" className="quiet-button retry-button" onClick={() => void sendRequest()}>
                    <Send size={14} /> Try again
                  </button>
                )}
                {!error && (
                  <span className="empty-hint">
                    <i /> No request sent yet
                  </span>
                )}
              </div>
            )}
            <div className="response-links">
              <span>
                <span className="green-dot" /> Requests run on demand
              </span>
              <a href={`${apiBase.replace(/\/+$/, '')}/openapi.json`} target="_blank" rel="noreferrer">
                OpenAPI spec <ExternalLink size={13} />
              </a>
            </div>
          </section>
        </div>
        <footer className="page-footer">
          <span>
            <b>REST in Pieces</b> <span className="footer-dot">·</span> deterministic fake data
          </span>
          <span>
            API PLAYGROUND <Workflow size={14} />
          </span>
        </footer>
      </main>
    </div>
  );
}
