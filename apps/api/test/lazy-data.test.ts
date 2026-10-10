import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FAMILY = /['"]@johnmorrisdotca\/(kuni|hata|chizu)(\/[\w-]+)?['"]/;

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.ts$/.test(name) ? [path] : [];
  });

describe("the family's data packages", () => {
  it('are imported only on first use: never by a static import that start-up would run', () => {
    for (const file of sources(join(import.meta.dirname, '..', 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const line of text.split('\n')) {
        if (!FAMILY.test(line)) continue;
        // A type import is erased; a dynamic import() runs when it is reached.
        // A name held in a variable (`const specifier = …`, `names`) is imported by `import(name)`, which a bundler leaves alone.
        const erased =
          /^\s*import type\b/.test(line) ||
          /\bimport\(\s*['"]/.test(line) ||
          /^\s*(const|let)\s+(specifier|names)\b/.test(line);
        expect(erased, `${file}: ${line.trim()}`).toBe(true);
      }
    }
  });
});
