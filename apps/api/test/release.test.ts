import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyRelease,
  CHANGELOG_FILE,
  changelogSection,
  compareSemver,
  currentVersion,
  isSemver,
  PACKAGE_FILES,
  releaseChangelog,
  setPackageVersion,
  today,
} from '../../../scripts/release.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const script = join(repoRoot, 'scripts/release.ts');

const changelog = `# Changelog

Intro.

## Unreleased

### Added

- A new thing.

## 1.2.0 - 2026-01-02

### Fixed

- An old thing.
`;

describe('versions', () => {
  it('accepts semver and refuses anything else', () => {
    for (const ok of ['1.0.0', '2.10.3', '3.0.0-rc.1', '3.0.0-alpha']) expect(isSemver(ok)).toBe(true);
    for (const bad of ['1.0', 'v1.0.0', '01.0.0', '1.0.0+build', '1.0.0-', 'latest']) expect(isSemver(bad)).toBe(false);
  });

  it('orders by semver precedence, prereleases before their release', () => {
    const ordered = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.2.0',
      '1.10.0',
      '2.0.0',
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(compareSemver(ordered[i - 1] as string, ordered[i] as string)).toBeLessThan(0);
      expect(compareSemver(ordered[i] as string, ordered[i - 1] as string)).toBeGreaterThan(0);
    }
    expect(compareSemver('2.1.0', '2.1.0')).toBe(0);
    expect(() => compareSemver('2.1', '2.1.0')).toThrow(/semver/);
  });

  it('sets only the top-level version of a package file', () => {
    const text = '{\n  "name": "x",\n  "version": "1.0.0",\n  "engines": {\n    "version": "keep"\n  }\n}\n';
    expect(setPackageVersion(text, '1.1.0')).toBe(text.replace('"1.0.0"', '"1.1.0"'));
    expect(() => setPackageVersion('{\n  "name": "x"\n}\n', '1.1.0')).toThrow(/version/);
  });

  it('formats the date as YYYY-MM-DD', () => {
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('changelog', () => {
  it('moves Unreleased under the new version and leaves an empty Unreleased', () => {
    expect(releaseChangelog(changelog, '1.3.0', '2026-10-08')).toBe(`# Changelog

Intro.

## Unreleased

## 1.3.0 - 2026-10-08

### Added

- A new thing.

## 1.2.0 - 2026-01-02

### Fixed

- An old thing.
`);
  });

  it('handles Unreleased as the last section', () => {
    const text = '# Changelog\n\n## Unreleased\n\n- Only thing.\n';
    expect(releaseChangelog(text, '0.1.0', '2026-10-08')).toBe(
      '# Changelog\n\n## Unreleased\n\n## 0.1.0 - 2026-10-08\n\n- Only thing.\n',
    );
  });

  it('refuses a missing or empty Unreleased section and a version already listed', () => {
    expect(() => releaseChangelog('# Changelog\n\n## 1.0.0\n\n- x\n', '1.1.0', 'd')).toThrow(/no "## Unreleased"/);
    expect(() => releaseChangelog('# Changelog\n\n## Unreleased\n\n## 1.0.0\n\n- x\n', '1.1.0', 'd')).toThrow(/empty/);
    expect(() => releaseChangelog(changelog, '1.2.0', 'd')).toThrow(/already has/);
  });

  it('extracts one version section for the release notes', () => {
    expect(changelogSection(changelog, '1.2.0')).toBe('### Fixed\n\n- An old thing.\n');
    expect(changelogSection(changelog, 'Unreleased')).toBe('### Added\n\n- A new thing.\n');
    expect(() => changelogSection(changelog, '1.2')).toThrow(/no "## 1.2" section/);
    expect(() => changelogSection('## 1.0.0 - d\n\n## 0.9.0\n- x\n', '1.0.0')).toThrow(/empty/);
  });
});

describe('applyRelease on a copy of the repository files', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'release-test-'));
    for (const file of [...PACKAGE_FILES, CHANGELOG_FILE]) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      copyFileSync(join(repoRoot, file), join(dir, file));
    }
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('moves every package file to the new version and releases the changelog', () => {
    const next = '99.0.0';
    const before = Object.fromEntries(PACKAGE_FILES.map((file) => [file, readFileSync(join(dir, file), 'utf8')]));
    expect(applyRelease(dir, next, '2026-10-08')).toEqual([...PACKAGE_FILES, CHANGELOG_FILE]);
    for (const file of PACKAGE_FILES) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(JSON.parse(text).version).toBe(next);
      // Nothing but the version line changes.
      expect(text.split('\n').filter((line, i) => line !== before[file]?.split('\n')[i])).toEqual([
        `  "version": "${next}",`,
      ]);
    }
    const released = readFileSync(join(dir, CHANGELOG_FILE), 'utf8');
    expect(released).toMatch(/## Unreleased\n\n## 99\.0\.0 - 2026-10-08\n/);
    expect(currentVersion(dir)).toBe(next);
  });

  it('refuses an invalid or older version and writes nothing', () => {
    const current = currentVersion(dir);
    const snapshot = () => [...PACKAGE_FILES, CHANGELOG_FILE].map((file) => readFileSync(join(dir, file), 'utf8'));
    const before = snapshot();
    expect(() => applyRelease(dir, 'next', 'd')).toThrow(/not a valid semver/);
    expect(() => applyRelease(dir, current, 'd')).toThrow(/not greater/);
    expect(() => applyRelease(dir, '0.0.1', 'd')).toThrow(/not greater/);
    expect(snapshot()).toEqual(before);
  });
});

describe('the command line', () => {
  it('prints a released section with --notes', () => {
    const notes = execFileSync(process.execPath, [script, '--notes', '2.0.0'], { encoding: 'utf8' });
    expect(notes).toBe(changelogSection(readFileSync(join(repoRoot, CHANGELOG_FILE), 'utf8'), '2.0.0'));
    expect(notes).toContain('Hono');
  });

  it('fails with usage when no version is given', () => {
    expect(() => execFileSync(process.execPath, [script], { cwd: dirname(script), stdio: 'pipe' })).toThrow();
  });
});
