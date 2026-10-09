/**
 * The in-memory session: an opt-in store that keeps writes, so a later read sees them, until
 * `POST /reset` puts the seeded data back. It lives in the app's own memory and nowhere else:
 * one store per `createApp()`, nothing written to disk, no timers, and every part of it capped.
 *
 * A dataset is copied into the store the first time a write changes it, keyed by dataset, seed and
 * locale, so `/users?seed=7` and `/users?locale=ja` are changed apart from `/users`. Everything the
 * store has not been asked to change is still read straight from the seeded, cached dataset.
 */
import type { Locale } from './locale.ts';

/** The ceilings a session keeps to. Each has a default; a smaller or larger one can be passed to `createApp`. */
export interface SessionLimits {
  /** Records one dataset may hold after creates, at one seed and locale. */
  records: number;
  /** Datasets, counted by seed and locale, that may hold changes at once. */
  datasets: number;
  /** Bytes of records written by the client, as JSON, across the whole session. */
  bytes: number;
}

export const DEFAULT_SESSION_LIMITS: SessionLimits = { records: 2000, datasets: 16, bytes: 8 * 1024 * 1024 };

/** `true` turns the session on with the default limits; an object turns it on with some limits changed. */
export type SessionOption = boolean | Partial<SessionLimits>;

/** A write the session has no room for. The app answers it with `507 Insufficient Storage`. */
export class SessionFullError extends Error {}

/** What a dataset must say about itself for the session to keep its records. */
export interface SessionResource {
  name: string;
  idField: string;
  load(seed: number, locale: Locale): { records: object[]; generatedAt: Date };
}

type Fields = Record<string, unknown>;

interface Overlay {
  dataset: string;
  seed: number;
  locale: Locale;
  idField: string;
  records: Fields[];
  /** The id the next create takes. It never goes back, so a deleted id is never given out again. */
  nextId: number;
  created: Set<string>;
  updated: Set<string>;
  deleted: Set<string>;
  /** Bytes of each record a client wrote, by id. */
  written: Map<string, number>;
  lastWrite: Date;
}

/** One changed dataset, as `GET /session` lists it. */
export interface SessionDataset {
  dataset: string;
  seed: number;
  locale: string;
  records: number;
  created: number;
  updated: number;
  deleted: number;
  lastWrite: string;
}

export interface SessionSummary {
  enabled: boolean;
  limits: SessionLimits;
  usage: { datasets: number; bytes: number };
  datasets: SessionDataset[];
}

export interface Session {
  readonly enabled: boolean;
  /** The records a read sees: the session's copy once a write has changed them, the seeded dataset otherwise. */
  load(resource: SessionResource, seed: number, locale: Locale): { records: object[]; generatedAt: Date };
  /** The id a create would take. */
  nextId(resource: SessionResource, seed: number, locale: Locale): number;
  /** Keeps a new record. Throws `SessionFullError` when the session has no room for it. */
  create(resource: SessionResource, seed: number, locale: Locale, record: Fields): void;
  /** Keeps the new state of a record that exists. */
  replace(resource: SessionResource, seed: number, locale: Locale, record: Fields): void;
  remove(resource: SessionResource, seed: number, locale: Locale, id: unknown): void;
  /** Drops every change, or one dataset's, and says how many datasets were put back. */
  reset(dataset?: string): number;
  summary(): SessionSummary;
}

const keyOf = (dataset: string, seed: number, locale: Locale) => `${dataset}:${locale}:${seed}`;
const sizeOf = (record: Fields) => new TextEncoder().encode(JSON.stringify(record)).length;

/** The session `createApp` uses: a store when `option` asks for one, and a pass-through to the seeded data when not. */
export function createSession(option: SessionOption | undefined): Session {
  const enabled = option !== undefined && option !== false;
  const limits: SessionLimits = { ...DEFAULT_SESSION_LIMITS, ...(typeof option === 'object' ? option : {}) };
  const overlays = new Map<string, Overlay>();
  const usedBytes = () =>
    [...overlays.values()].reduce((sum, o) => sum + [...o.written.values()].reduce((a, b) => a + b, 0), 0);

  const maxId = (records: readonly object[], idField: string) =>
    Math.max(-1, ...records.map((record) => Number((record as Fields)[idField])).filter(Number.isFinite));

  /** The dataset's copy in the store, made on its first write. */
  const overlayFor = (resource: SessionResource, seed: number, locale: Locale): Overlay => {
    const key = keyOf(resource.name, seed, locale);
    const found = overlays.get(key);
    if (found) return found;
    if (overlays.size >= limits.datasets) {
      throw new SessionFullError(
        `The session keeps changes to at most ${limits.datasets} datasets (counting each seed and locale apart). POST /reset to start again.`,
      );
    }
    const { records } = resource.load(seed, locale);
    const overlay: Overlay = {
      dataset: resource.name,
      seed,
      locale,
      idField: resource.idField,
      records: [...(records as Fields[])],
      nextId: maxId(records, resource.idField) + 1,
      created: new Set(),
      updated: new Set(),
      deleted: new Set(),
      written: new Map(),
      lastWrite: new Date(),
    };
    overlays.set(key, overlay);
    return overlay;
  };

  /** Refuses a write that would take the session past its byte ceiling. */
  const makeRoom = (overlay: Overlay, id: string, bytes: number) => {
    const total = usedBytes() - (overlay.written.get(id) ?? 0) + bytes;
    if (total > limits.bytes) {
      throw new SessionFullError(
        `The session keeps at most ${limits.bytes} bytes of written records. POST /reset to start again.`,
      );
    }
  };

  const idOf = (overlay: Overlay, record: Fields) => String(record[overlay.idField]);

  return {
    enabled,
    load(resource, seed, locale) {
      const overlay = enabled ? overlays.get(keyOf(resource.name, seed, locale)) : undefined;
      return overlay ? { records: overlay.records, generatedAt: overlay.lastWrite } : resource.load(seed, locale);
    },
    nextId(resource, seed, locale) {
      const overlay = enabled ? overlays.get(keyOf(resource.name, seed, locale)) : undefined;
      return overlay ? overlay.nextId : maxId(resource.load(seed, locale).records, resource.idField) + 1;
    },
    create(resource, seed, locale, record) {
      if (!enabled) return;
      const overlay = overlayFor(resource, seed, locale);
      if (overlay.records.length >= limits.records) {
        throw new SessionFullError(
          `The session keeps at most ${limits.records} ${resource.name} at one seed and locale. Delete some, or POST /reset to start again.`,
        );
      }
      const id = idOf(overlay, record);
      const bytes = sizeOf(record);
      makeRoom(overlay, id, bytes);
      overlay.records.push(record);
      overlay.nextId = Math.max(overlay.nextId, Number(record[overlay.idField]) + 1);
      overlay.created.add(id);
      overlay.written.set(id, bytes);
      overlay.lastWrite = new Date();
    },
    replace(resource, seed, locale, record) {
      if (!enabled) return;
      const overlay = overlayFor(resource, seed, locale);
      const id = idOf(overlay, record);
      const bytes = sizeOf(record);
      makeRoom(overlay, id, bytes);
      const at = overlay.records.findIndex((existing) => String(existing[overlay.idField]) === id);
      if (at < 0) return;
      overlay.records[at] = record;
      if (!overlay.created.has(id)) overlay.updated.add(id);
      overlay.written.set(id, bytes);
      overlay.lastWrite = new Date();
    },
    remove(resource, seed, locale, rawId) {
      if (!enabled) return;
      const overlay = overlayFor(resource, seed, locale);
      const id = String(rawId);
      overlay.records = overlay.records.filter((existing) => String(existing[overlay.idField]) !== id);
      overlay.written.delete(id);
      overlay.updated.delete(id);
      // A record created in this session and deleted again leaves no trace; a seeded one is counted as deleted.
      if (!overlay.created.delete(id)) overlay.deleted.add(id);
      overlay.lastWrite = new Date();
    },
    reset(dataset) {
      let count = 0;
      for (const [key, overlay] of overlays) {
        if (dataset !== undefined && overlay.dataset !== dataset) continue;
        overlays.delete(key);
        count++;
      }
      return count;
    },
    summary() {
      return {
        enabled,
        limits,
        usage: { datasets: overlays.size, bytes: usedBytes() },
        datasets: [...overlays.values()].map((overlay) => ({
          dataset: overlay.dataset,
          seed: overlay.seed,
          locale: overlay.locale,
          records: overlay.records.length,
          created: overlay.created.size,
          updated: overlay.updated.size,
          deleted: overlay.deleted.size,
          lastWrite: overlay.lastWrite.toISOString(),
        })),
      };
    },
  };
}
