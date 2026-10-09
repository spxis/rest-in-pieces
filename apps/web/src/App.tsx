import { LoaderCircle, Send, Workflow } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { EndpointTabs } from './components/EndpointTabs.tsx';
import { FieldsEditor, fieldProblem } from './components/FieldsEditor.tsx';
import { FormatPicker, SimulationPanel } from './components/OutputAndSimulation.tsx';
import { PageAndSort, SearchAndFilters } from './components/QueryControls.tsx';
import { RequestPreview } from './components/RequestPreview.tsx';
import { ResponsePanel } from './components/ResponsePanel.tsx';
import { ScenarioPresets } from './components/ScenarioPresets.tsx';
import { Topbar } from './components/Topbar.tsx';
import { useCatalog } from './hooks/useCatalog.ts';
import { useCopy } from './hooks/useCopy.ts';
import { useRequest } from './hooks/useRequest.ts';
import { useSpeaker } from './i18n/LocaleProvider.tsx';
import type { PhraseKey } from './i18n/phrases.ts';
import { configFromHash, configToHash, defaultConfig, type PlaygroundConfig } from './lib/config.ts';
import { buildRequestUrl } from './lib/request.ts';

const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Renders `code` spans in dataset descriptions. */
function Description({ text }: { text: string }) {
  return (
    <p className="endpoint-description">
      {text.split('`').map((part, i) => (i % 2 ? <code key={part}>{part}</code> : part))}
    </p>
  );
}

const merge = (state: PlaygroundConfig, patch: Partial<PlaygroundConfig>): PlaygroundConfig => ({ ...state, ...patch });

const DATASET_PHRASES: Record<string, PhraseKey> = {
  names: 'dataset.names',
  users: 'dataset.users',
  products: 'dataset.products',
  companies: 'dataset.companies',
  countries: 'dataset.countries',
};

export default function App() {
  const { locale: uiLocale, say } = useSpeaker();
  // A reader of the Japanese playground starts on Japanese data. A shared setup is reproduced exactly instead.
  const [config, update] = useReducer(merge, undefined, () => {
    const shared = window.location.hash.length > 1;
    return configFromHash(window.location.hash, {
      ...defaultConfig(),
      locale: uiLocale === 'ja' && !shared ? 'ja' : 'en-CA',
    });
  });
  const catalog = useCatalog(config.apiBase);
  const { result, error, sending, send } = useRequest();
  const { copied, copy } = useCopy();

  const resource = catalog.resources.find((r) => r.name === config.endpoint);
  const isGenerate = config.endpoint === 'generate';
  const fields = isGenerate
    ? ['index', ...config.fields.map((field) => field.name)]
    : (resource?.locales?.[config.locale]?.fields ?? resource?.fields ?? []);
  const seeded = isGenerate || (resource?.seeded ?? true);
  const url = useMemo(() => buildRequestUrl(config, seeded), [config, seeded]);
  const problem = isGenerate ? fieldProblem(config.fields) : null;

  const sendConfig = useCallback(
    (next: PlaygroundConfig) => {
      if (isGenerate && fieldProblem(next.fields)) return;
      void send(buildRequestUrl(next, seeded), next.format);
    },
    [isGenerate, seeded, send],
  );

  const openEndpoint = (endpoint: string) => {
    // Sort fields and filters belong to the previous dataset, so they start fresh.
    update({ endpoint, offset: 0, sortBy: '', filters: [], metadata: endpoint !== 'countries' });
  };

  const share = () => {
    const link = new URL(window.location.href);
    link.hash = configToHash(config);
    void copy(link.toString(), 'setup');
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        sendConfig(config);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [config, sendConfig]);

  return (
    <div className="app-shell">
      <Topbar
        apiBase={config.apiBase}
        online={catalog.state === 'offline' ? false : catalog.state === 'ready' || null}
      />

      <main className="workspace">
        <section className="page-heading">
          <div>
            <p className="eyebrow">
              <span>{say('app.eyebrow')}</span>
              <span className="eyebrow-line" />
            </p>
            <h1>{say('app.title')}</h1>
            <p className="intro">{say('app.intro')}</p>
          </div>
          <div className="api-address">
            <label htmlFor="api-base">{say('app.apiBase')}</label>
            <input
              id="api-base"
              value={config.apiBase}
              onChange={(event) => update({ apiBase: event.target.value })}
              spellCheck={false}
              inputMode="url"
            />
          </div>
        </section>

        <div className="playground-grid">
          <section className="request-panel" aria-label={say('app.builder')}>
            <div className="section-bar">
              <div className="section-title">
                <span className="step-number">01</span>
                <h2>{say('app.build')}</h2>
              </div>
              <span className="method-tag">GET</span>
            </div>

            <EndpointTabs resources={catalog.resources} value={config.endpoint} onChange={openEndpoint} />
            {resource && (
              <Description
                text={
                  uiLocale === 'en' || !DATASET_PHRASES[resource.name]
                    ? resource.description
                    : say(DATASET_PHRASES[resource.name] as PhraseKey)
                }
              />
            )}
            <ScenarioPresets config={config} onApply={update} />

            {isGenerate && (
              <FieldsEditor
                fields={config.fields}
                generators={catalog.generators}
                state={catalog.state}
                onChange={(next) => update({ fields: next })}
              />
            )}
            <PageAndSort config={config} fields={fields} seeded={seeded} locales={catalog.locales} onChange={update} />
            <SearchAndFilters config={config} fields={fields} onChange={update} />
            <FormatPicker value={config.format} onChange={update} />
            <SimulationPanel config={config} onChange={update} />
            <RequestPreview url={url} format={config.format} copied={copied} onCopy={copy} onShare={share} />

            <button
              type="button"
              className="send-button"
              onClick={() => sendConfig(config)}
              disabled={sending || problem !== null}
            >
              {sending ? <LoaderCircle className="spin" size={17} /> : <Send size={16} />}
              {say(sending ? 'app.sending' : 'app.send')}
              {!sending && <kbd>{MAC ? '⌘ ↵' : 'Ctrl ↵'}</kbd>}
            </button>
          </section>

          <ResponsePanel
            apiBase={config.apiBase}
            result={result}
            error={error}
            sending={sending}
            copied={copied}
            onCopy={copy}
            onRetry={() => sendConfig(config)}
            pager={{
              offset: config.offset,
              limit: config.limit,
              onPage: (offset) => {
                const next = { ...config, offset };
                update({ offset });
                sendConfig(next);
              },
            }}
          />
        </div>
        <footer className="page-footer">
          <span>
            <b lang="en">REST in Pieces</b> <span className="footer-dot">·</span> {say('app.footerTagline')}
          </span>
          <span>
            {say('app.footerLabel')} <Workflow size={14} />
          </span>
        </footer>
      </main>
    </div>
  );
}
