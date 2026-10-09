import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider.tsx';
import { NPM_URL, REPO_URL } from '../lib/links.ts';
import { APP_COMMIT, APP_VERSION } from '../lib/version.ts';
import { Topbar, VersionBadge } from './Topbar.tsx';

// The source of truth, read from disk rather than copied, so a playground showing any other number fails here.
const apiPackage = JSON.parse(readFileSync(join(import.meta.dirname, '../../../api/package.json'), 'utf8')) as {
  version: string;
};

describe('the version in the top bar', () => {
  afterEach(cleanup);

  it('is the API package version', () => {
    expect(APP_VERSION).toBe(apiPackage.version);
    render(
      <LocaleProvider initial="en">
        <Topbar apiBase="http://localhost:6800" online={true} />
      </LocaleProvider>,
    );
    const shown = screen.getByTestId('app-version');
    expect(shown.textContent).toBe(apiPackage.version);
    expect(shown.title).toBe(`Version ${apiPackage.version}`);
  });

  it('carries no commit outside the Pages build', () => {
    expect(APP_COMMIT).toBe('');
  });

  it('adds the commit when the build has one, as the Pages build does', () => {
    render(
      <LocaleProvider initial="en">
        <VersionBadge version="2.3.0" commit="abc1234" />
      </LocaleProvider>,
    );
    const shown = screen.getByTestId('app-version');
    expect(shown.textContent).toBe('2.3.0 · abc1234');
    expect(shown.title).toBe('Version 2.3.0, built from commit abc1234');
  });
});

describe('the links in the top bar', () => {
  afterEach(cleanup);

  it('leads to the API reference, the fixtures, the npm package and the repository', () => {
    render(
      <LocaleProvider initial="en">
        <Topbar apiBase="http://localhost:6800/" online={true} />
      </LocaleProvider>,
    );
    const links = screen.getByRole('navigation', { name: 'Project links' });
    const href = (name: string) => links.querySelector(`a[title="${name}"]`)?.getAttribute('href');
    expect(screen.getByRole('link', { name: /API docs/ }).getAttribute('href')).toBe('http://localhost:6800/docs');
    expect(screen.getByRole('link', { name: /Fixtures/ }).getAttribute('href')).toBe(
      'https://spxis.github.io/rest-in-pieces/fixtures/index.json',
    );
    expect(href('The rest-in-pieces package on npm')).toBe(NPM_URL);
    expect(href('Source code on GitHub')).toBe(REPO_URL);
    for (const link of links.querySelectorAll('a')) expect(link.getAttribute('rel')).toBe('noreferrer');
  });
});
