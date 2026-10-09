import { LoaderCircle, Send, Workflow } from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { EndpointTabs } from './components/EndpointTabs.tsx';
import { FieldsEditor, fieldProblem } from './components/FieldsEditor.tsx';
import { FormatPicker, SimulationPanel } from './components/OutputAndSimulation.tsx';
import { PageAndSort, SearchAndFilters } from './components/QueryControls.tsx';
import { RelationsControls } from './components/RelationsControls.tsx';
import { RequestPreview } from './components/RequestPreview.tsx';
import { ResponsePanel } from './components/ResponsePanel.tsx';
import { SCENARIO_SHARE, ScenarioPresets } from './components/ScenarioPresets.tsx';
import { SessionPanel } from './components/SessionPanel.tsx';
import { SignInPanel } from './components/SignInPanel.tsx';
import { Topbar } from './components/Topbar.tsx';
import { MethodPicker, WriteRequest } from './components/WriteControls.tsx';
import { useAuth } from './hooks/useAuth.ts';
import { useCatalog } from './hooks/useCatalog.ts';
import { useCopy } from './hooks/useCopy.ts';
import { useRequest } from './hooks/useRequest.ts';
import { useSession } from './hooks/useSession.ts';
import { useSpeaker } from './i18n/LocaleProvider.tsx';
import type { PhraseKey } from './i18n/phrases.ts';
import {
  configFromHash,
  configToHash,
  defaultConfig,
  type HttpMethod,
  METHODS,
  type PlaygroundConfig,
} from './lib/config.ts';
import { buildRequestUrl } from './lib/request.ts';
import { sampleBody } from './lib/samples.ts';

const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Renders `code` spans in dataset descriptions. */
function Description({ text }: { text: string }) {
  return (
    <p className="endpoint-description">
      {text.split('`').map((part, i) =>
        // biome-ignore lint/suspicious/noArrayIndexKey: a description may name the same field twice (`userId`), and its pieces never move
        i % 2 ? <code key={i}>{part}</code> : part,
      )}
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
  orders: 'dataset.orders',
  posts: 'dataset.posts',
  comments: 'dataset.comments',
  todos: 'dataset.todos',
  reviews: 'dataset.reviews',
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
  const auth = useAuth(config.apiBase);
  const session = useSession(config.apiBase);

  const resource = catalog.resources.find((r) => r.name === config.endpoint);
  // A list under one record (`/users/7/orders`) lists another dataset, whose fields sort and filter it.
  const nested = config.nested && resource?.nested?.includes(config.nested) ? config.nested : '';
  const listed = nested ? catalog.resources.find((r) => r.name === nested) : resource;
  const isGenerate = config.endpoint === 'generate';
  const fields = isGenerate
    ? ['index', ...config.fields.map((field) => field.name)]
    : (listed?.locales?.[config.locale]?.fields ?? listed?.fields ?? []);
  const seeded = isGenerate || (resource?.seeded ?? true);
  // A dataset the API does not mark writable takes GET, whatever a shared link asked for.
  const methods = resource?.writable ? METHODS : (['GET'] as const);
  const method: HttpMethod = methods.includes(config.method) ? config.method : 'GET';
  const writing = method !== 'GET';
  /** The setup as sent: embeds only the listed dataset has, so a shared link or an older API never breaks it. */
  const asSent = useCallback(
    (next: PlaygroundConfig): PlaygroundConfig => ({
      ...next,
      method,
      nested,
      expand: next.expand.filter((path) => listed?.expand?.includes(path)),
    }),
    [method, nested, listed],
  );
  const url = useMemo(() => buildRequestUrl(asSent(config), seeded), [asSent, config, seeded]);
  const problem = isGenerate ? fieldProblem(config.fields) : null;

  const { token } = auth;
  const { reload: reloadSession } = session;
  /** Sends the setup, with the signed-in token when there is one. A write is followed by a look at the session. */
  const sendConfig = useCallback(
    (next: PlaygroundConfig, withToken: string | null = token) => {
      if (isGenerate && fieldProblem(next.fields)) return;
      void send(buildRequestUrl(asSent(next), seeded), next.format, { method, body: next.body, token: withToken }).then(
        () => {
          if (method !== 'GET') void reloadSession();
        },
      );
    },
    [isGenerate, method, asSent, seeded, send, token, reloadSession],
  );

  /** A body the reader has not touched follows the dataset and method; one they edited stays. */
  const untouched = !config.body.trim() || config.body === sampleBody(config.endpoint, config.method);
  const chooseMethod = (next: HttpMethod) =>
    update({ method: next, ...(untouched ? { body: sampleBody(config.endpoint, next) } : {}) });

  const openEndpoint = (endpoint: string) => {
    // Sort fields, filters and a sample body belong to the previous dataset, so they start fresh.
    update({
      endpoint,
      offset: 0,
      sortBy: '',
      filters: [],
      nested: '',
      expand: [],
      metadata: endpoint !== 'countries',
      ...(untouched ? { body: sampleBody(endpoint, config.method) } : {}),
    });
  };

  /** Copies a link that restores this setup. `key` says which button asked, so only that one says "Copied". */
  const share = (key: string) => {
    const link = new URL(window.location.href);
    link.hash = configToHash(config);
    void copy(link.toString(), key);
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
              <MethodPicker methods={methods} value={method} onChange={chooseMethod} />
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
            <ScenarioPresets
              config={config}
              onApply={update}
              copied={copied}
              onShare={() => share(SCENARIO_SHARE)}
              simulationOnly={writing}
            />

            {isGenerate && (
              <FieldsEditor
                fields={config.fields}
                generators={catalog.generators}
                parameters={catalog.parameters}
                state={catalog.state}
                onChange={(next) => update({ fields: next })}
              />
            )}
            {writing ? (
              <WriteRequest
                config={{ ...config, method }}
                idField={resource?.idField ?? 'id'}
                onChange={update}
                onResetBody={() => update({ body: sampleBody(config.endpoint, method) })}
                kept={session.summary?.enabled === true}
              />
            ) : (
              <>
                <PageAndSort
                  config={config}
                  fields={fields}
                  seeded={seeded}
                  locales={catalog.locales}
                  onChange={update}
                />
                <RelationsControls
                  config={{ ...config, nested }}
                  resource={resource}
                  target={listed}
                  onChange={update}
                />
                <SearchAndFilters config={config} fields={fields} onChange={update} />
                <FormatPicker value={config.format} table={config.table} onChange={update} />
              </>
            )}
            <SimulationPanel config={config} onChange={update} />
            <SignInPanel auth={auth} config={config} onChange={update} />
            <SessionPanel session={session} />
            <RequestPreview
              url={url}
              apiBase={config.apiBase}
              format={config.format}
              request={{ method, body: config.body }}
              account={auth.username}
              session={session.summary?.enabled === true}
              copied={copied}
              onCopy={copy}
              onShare={() => share('setup')}
            />

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
            onSignIn={() =>
              void auth
                .signIn('viewer', '15m', { seed: config.seed, locale: config.locale })
                .then((fresh) => fresh && sendConfig(config, fresh))
            }
            pager={
              writing
                ? null
                : {
                    offset: config.offset,
                    limit: config.limit,
                    onPage: (offset) => {
                      const next = { ...config, offset };
                      update({ offset });
                      sendConfig(next);
                    },
                  }
            }
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
