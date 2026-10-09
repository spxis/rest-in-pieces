import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHANGELOG_FILE, PACKAGE_FILES } from '../../../scripts/release.ts';
import { type Envelope, request } from './helpers.ts';

// Every landed change takes its own version (CONTRIBUTING.md), so these numbers move often and must move together.
// The playground's half of this, that its top bar shows apps/api/package.json, is apps/web/src/components/Topbar.test.tsx.

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = (file: string) => readFileSync(join(repoRoot, file), 'utf8');
const versions = Object.fromEntries(
  PACKAGE_FILES.map((file) => [file, (JSON.parse(read(file)) as { version: string }).version]),
);
const version = versions['package.json'] as string;

/** The version of the first `## <version> - <YYYY-MM-DD>` heading, which is the latest release. */
function topDatedVersion(changelog: string): string | undefined {
  return /^## (\S+) - \d{4}-\d{2}-\d{2}$/m.exec(changelog)?.[1];
}

describe('the version', () => {
  it('is the same in all three package.json files', () => {
    expect(versions).toEqual(Object.fromEntries(PACKAGE_FILES.map((file) => [file, version])));
  });

  it('heads the top dated section of the changelog', () => {
    expect(topDatedVersion(read(CHANGELOG_FILE))).toBe(version);
  });

  it('finds the top dated section beneath Unreleased', () => {
    const text = '# Changelog\n\n## Unreleased\n\n- x\n\n## 3.1.0 - 2026-10-09\n\n- y\n\n## 3.0.0 - 2026-10-08\n';
    expect(topDatedVersion(text)).toBe('3.1.0');
    expect(topDatedVersion('# Changelog\n\n## Unreleased\n')).toBeUndefined();
  });

  it('is what the API reports on /health, the landing page and every envelope', async () => {
    const health = await request<{ version: string }>('/health');
    expect(health.body.version).toBe(version);
    const home = await request<string>('/');
    expect(home.text).toContain(`v${version}`);
    const list = await request<Envelope>('/names?limit=1');
    expect(list.body.metadata.version).toBe(version);
  });
});
