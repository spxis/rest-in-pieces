import { ExternalLink, Workflow } from 'lucide-react';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import { IN_BROWSER, isInBrowserApi } from '../lib/inBrowserApi.ts';
import { isLocalApi, trimBase } from '../lib/request.ts';
import { APP_COMMIT, APP_VERSION } from '../lib/version.ts';
import { LanguagePicker } from './LanguagePicker.tsx';

/** `2.2.0 · abc1234` when the build knows its commit, `2.2.0` otherwise. A phone shows the version alone. */
export function VersionBadge({ version, commit }: { version: string; commit: string }) {
  const { say } = useSpeaker();
  return (
    <span
      className="brand-version"
      data-testid="app-version"
      title={commit ? say('topbar.versionCommit', { version, commit }) : say('topbar.version', { version })}
    >
      {version}
      {commit ? <span className="brand-commit"> · {commit}</span> : null}
    </span>
  );
}

/** The static fixtures are written into the Pages build only; every other build links to the published copy. */
export const FIXTURES_URL = IN_BROWSER
  ? `${import.meta.env.BASE_URL}fixtures/index.json`
  : 'https://spxis.github.io/rest-in-pieces/fixtures/index.json';

export function Topbar({ apiBase, online }: { apiBase: string; online: boolean | null }) {
  const { say } = useSpeaker();
  const local = isLocalApi(apiBase);
  const label = say(
    isInBrowserApi(apiBase)
      ? 'topbar.inBrowser'
      : local === null
        ? 'topbar.invalid'
        : local
          ? 'topbar.local'
          : 'topbar.remote',
  );
  return (
    <header className="topbar">
      <div className="topbar-left">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label={say('topbar.home')}>
          <span className="brand-mark">
            <Workflow size={19} strokeWidth={2.2} />
          </span>
          <span lang="en">
            REST <b>in</b> Pieces
          </span>
        </a>
        <VersionBadge version={APP_VERSION} commit={APP_COMMIT} />
      </div>
      <div className="topbar-right">
        <span
          className={online === false ? 'environment offline' : 'environment'}
          title={online === false ? say('topbar.offline') : undefined}
        >
          <i /> {label}
        </span>
        <a className="docs-link" href={`${trimBase(apiBase)}/docs`} target="_blank" rel="noreferrer">
          {say('topbar.docs')} <ExternalLink size={14} />
        </a>
        <a
          className="docs-link fixtures-link"
          href={FIXTURES_URL}
          target="_blank"
          rel="noreferrer"
          title={say('topbar.fixturesTitle')}
        >
          {say('topbar.fixtures')} <ExternalLink size={14} />
        </a>
        <LanguagePicker />
      </div>
    </header>
  );
}
