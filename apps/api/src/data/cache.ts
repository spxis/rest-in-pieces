const MAX_ENTRIES = 32;
const entries = new Map<string, { records: object[]; generatedAt: Date }>();

/** Memoizes generated datasets by key, evicting the least recently used once full. */
export function cached<T extends object>(key: string, build: () => T[]): { records: T[]; generatedAt: Date } {
  const hit = entries.get(key);
  if (hit) {
    entries.delete(key);
    entries.set(key, hit);
    return hit as { records: T[]; generatedAt: Date };
  }
  const entry = { records: build(), generatedAt: new Date() };
  entries.set(key, entry);
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
  return entry;
}
