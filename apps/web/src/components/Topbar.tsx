import { BookOpen, FileJson, Package, Workflow } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import { IN_BROWSER, isInBrowserApi } from '../lib/inBrowserApi.ts';
import { docsUrl, fixturesUrl, NPM_URL, REPO_URL } from '../lib/links.ts';
import { isLocalApi } from '../lib/request.ts';
import { APP_COMMIT, APP_VERSION } from '../lib/version.ts';
import { LanguagePicker } from './LanguagePicker.tsx';
import { ThemeSwitch } from './ThemeSwitch.tsx';

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

/** GitHub's mark, which lucide does not draw. */
function GitHubMark() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** A link out of the playground. Narrow screens keep the icon and hand the label to screen readers. */
function TopbarLink({ href, icon, label, title }: { href: string; icon: ReactNode; label: string; title?: string }) {
  return (
    <a className="topbar-link" href={href} target="_blank" rel="noreferrer" title={title ?? label}>
      {icon}
      <span className="topbar-link-label">{label}</span>
    </a>
  );
}

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
        <nav className="topbar-links" aria-label={say('topbar.links')}>
          <TopbarLink
            href={docsUrl(apiBase, isInBrowserApi(apiBase), import.meta.env.BASE_URL)}
            icon={<BookOpen size={14} />}
            label={say('topbar.docs')}
          />
          <TopbarLink
            href={fixturesUrl(IN_BROWSER, import.meta.env.BASE_URL)}
            icon={<FileJson size={14} />}
            label={say('topbar.fixtures')}
            title={say('topbar.fixturesTitle')}
          />
          <TopbarLink href={NPM_URL} icon={<Package size={14} />} label="npm" title={say('topbar.npmTitle')} />
          <TopbarLink href={REPO_URL} icon={<GitHubMark />} label="GitHub" title={say('topbar.repoTitle')} />
        </nav>
        <ThemeSwitch />
        <LanguagePicker />
      </div>
    </header>
  );
}
