/**
 * Relations between datasets, as one request sees them: looking a record up by id, listing a parent's
 * children, and embedding related records with `expand=`.
 *
 * Every lookup reads what the request's other routes would read: the session's copy of a dataset once a write
 * has changed it, the seeded dataset otherwise, with `safe` values and `messy` rewrites applied the same way, so
 * an embedded record reads exactly as it does on its own route. With the seeded data, a record's id is its
 * position plus one and a parent's children are a range worked out from the seed, so nothing is scanned; once
 * the session holds a copy, a lookup table is built once per request, over at most a few thousand records.
 */

import { childRange, type OwnedDataset, ownership } from '../data/owners.ts';
import type { Locale } from './locale.ts';
import { messyRecord } from './messy.ts';
import { pick, type Query } from './query.ts';
import { type SafeContext, safeRecord } from './safe.ts';
import type { Session, SessionResource } from './session.ts';

type Fields = Record<string, unknown>;

/** A record that points at one other: `userId` on an order points at a user. */
export interface ToOne {
  kind: 'one';
  target: string;
  key: string;
}

/** A record that many others point at: a user's orders carry the user's id in `userId`. */
export interface ToMany {
  kind: 'many';
  target: string;
  key: string;
}

/** A record that lists the ids of others in an array field: a grouping's `members` are country codes. */
export interface ToList {
  kind: 'list';
  target: string;
  key: string;
}

/** An array field whose entries point at other records: an order's `items`, each with a `productId`. */
export interface Embedded {
  kind: 'items';
  relations: Record<string, ToOne>;
}

export type Relation = ToOne | ToMany | ToList | Embedded;

/** What the relations need to know about a dataset. `Resource` has all of it. */
export interface RelatedResource extends SessionResource {
  seeded: boolean;
  /** Fields `messy` leaves alone: the id and the keys that join datasets. */
  keep?: readonly string[];
  relations?: Record<string, Relation>;
  /**
   * Loads what the dataset is made from, when it is made from something big enough to wait for (the family's packages).
   * A route awaits it before reading the dataset. `hint` names the countries a request is about, so a dataset that
   * is split by country loads only those; none means all of them.
   */
  ready?(request?: { query?: Query; id?: string; hint?: readonly string[] }): Promise<void>;
  /** The dataset is owned by a parent, so a parent's children are a range found by arithmetic. */
  owned?: { dataset: OwnedDataset; key: string };
}

/** The deepest `expand` path, the most paths one request may give, and the most records it may embed. */
export const MAX_EXPAND_DEPTH = 2;
export const MAX_EXPAND_PATHS = 6;
export const MAX_EMBEDDED = 5000;

export class ExpandError extends Error {}

/** One request's view of the data: the same seed, locale, session, safe values and mess for every dataset it reads. */
export class RequestData {
  private readonly loaded = new Map<string, Fields[]>();
  private readonly byId = new Map<string, Map<string, number>>();
  private readonly byKey = new Map<string, Map<string, number[]>>();
  private embedded = 0;

  private readonly lookup: (name: string) => RelatedResource | undefined;
  readonly session: Session;
  readonly seed: number;
  readonly locale: Locale;
  readonly safe: SafeContext | null;
  readonly messy: number;

  constructor(
    lookup: (name: string) => RelatedResource | undefined,
    session: Session,
    seed: number,
    locale: Locale,
    safe: SafeContext | null,
    messy: number,
  ) {
    this.lookup = lookup;
    this.session = session;
    this.seed = seed;
    this.locale = locale;
    this.safe = safe;
    this.messy = messy;
  }

  resource(name: string): RelatedResource {
    const found = this.lookup(name);
    if (!found) throw new Error(`No dataset named ${name}`);
    return found;
  }

  /** The records a read sees, before `safe` and `messy`. */
  records(resource: RelatedResource): Fields[] {
    let records = this.loaded.get(resource.name);
    if (!records) {
      records = this.session.load(resource, this.seed, this.locale).records as Fields[];
      this.loaded.set(resource.name, records);
    }
    return records;
  }

  /** Whether the dataset is the seeded one, untouched by the session, so ids and ranges can be worked out. */
  pristine(resource: RelatedResource): boolean {
    return resource.seeded && !this.session.holds(resource.name, this.seed, this.locale);
  }

  /** The position of the record with this id, or -1. */
  indexOf(resource: RelatedResource, id: unknown): number {
    const records = this.records(resource);
    const wanted = String(id);
    if (this.pristine(resource) && /^\d+$/.test(wanted)) {
      const at = Number(wanted) - (resource.idField === 'index' ? 0 : 1);
      if (String(records[at]?.[resource.idField]) === wanted) return at;
    }
    let index = this.byId.get(resource.name);
    if (!index) {
      index = new Map(records.map((record, i) => [String(record[resource.idField]), i]));
      this.byId.set(resource.name, index);
    }
    return index.get(wanted) ?? -1;
  }

  /** A record as its own route shows it: with `safe` values, then `messy`'s rewrites for its position. */
  present(resource: RelatedResource, index: number): Fields {
    const record = this.records(resource)[index] as Fields;
    const safe = this.safe ? safeRecord(resource.name, record, this.safe) : record;
    return messyRecord(safe, index, { share: this.messy, seed: this.seed, keep: resource.keep ?? [resource.idField] });
  }

  /** The positions of a parent's children in the child dataset, in id order. */
  childPositions(child: RelatedResource, key: string, parentId: unknown): number[] {
    if (child.owned?.key === key && this.pristine(child)) {
      const range = childRange(ownership(this.seed, child.owned.dataset), Number(parentId));
      if (!range) return [];
      return Array.from({ length: range[1] - range[0] }, (_, i) => range[0] + i);
    }
    const id = `${child.name}:${key}`;
    let groups = this.byKey.get(id);
    if (!groups) {
      groups = new Map();
      this.records(child).forEach((record, i) => {
        // An array field (a grouping's members) puts the record under each of its entries.
        const field = record[key];
        for (const one of Array.isArray(field) ? field : [field]) {
          const value = String(one);
          const list = groups?.get(value);
          if (list) list.push(i);
          else groups?.set(value, [i]);
        }
      });
      this.byKey.set(id, groups);
    }
    return groups.get(String(parentId)) ?? [];
  }

  /** Counts records about to be embedded, refusing a request that would embed more than the ceiling. */
  spend(count: number): void {
    this.embedded += count;
    if (this.embedded > MAX_EMBEDDED) {
      throw new ExpandError(
        `expand would embed more than ${MAX_EMBEDDED} records. Ask for a smaller page, or expand less.`,
      );
    }
  }
}

/** A tree of relation names: `user,items.product` is `{ user: {}, items: { product: {} } }`. */
export type ExpandTree = Map<string, ExpandTree>;

/** Names a resource can expand, for error messages and the docs. */
export function expandable(resource: RelatedResource, lookup: (name: string) => RelatedResource | undefined): string[] {
  const names: string[] = [];
  for (const [name, relation] of Object.entries(resource.relations ?? {})) {
    if (relation.kind === 'items') {
      for (const inner of Object.keys(relation.relations)) names.push(`${name}.${inner}`);
      continue;
    }
    names.push(name);
    const target = lookup(relation.target);
    for (const [deeper, next] of Object.entries(target?.relations ?? {})) {
      if (next.kind !== 'items') names.push(`${name}.${deeper}`);
    }
  }
  return names;
}

/** Reads `expand`: comma-separated paths of up to two names each, every one a relation of the dataset it reaches. */
export function parseExpand(
  query: Query,
  resource: RelatedResource,
  lookup: (name: string) => RelatedResource | undefined,
): ExpandTree | null {
  const value = pick(query, 'expand');
  if (value === undefined) return null;
  const paths = value
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean);
  const offer = () => {
    const names = expandable(resource, lookup);
    return names.length > 0
      ? `${resource.name} can expand: ${names.join(', ')}.`
      : `${resource.name} has nothing to expand.`;
  };
  if (paths.length > MAX_EXPAND_PATHS) throw new ExpandError(`expand takes at most ${MAX_EXPAND_PATHS} paths.`);
  const tree: ExpandTree = new Map();
  for (const path of paths) {
    const names = path.split('.');
    if (names.length > MAX_EXPAND_DEPTH) {
      throw new ExpandError(`"${path}" is ${names.length} levels deep; expand goes ${MAX_EXPAND_DEPTH} at most.`);
    }
    let at: RelatedResource | undefined = resource;
    let items: Embedded | undefined;
    let node = tree;
    for (const name of names) {
      const relation: Relation | undefined = items ? items.relations[name] : at?.relations?.[name];
      if (!relation) throw new ExpandError(`"${path}" is not a relation. ${offer()}`);
      if (relation.kind === 'items') {
        if (names.length === 1)
          throw new ExpandError(
            `"${path}" is always included; expand "${path}.${Object.keys(relation.relations)[0]}" to embed what it points at.`,
          );
        items = relation;
        at = undefined;
      } else {
        items = undefined;
        at = lookup(relation.target);
      }
      const next = node.get(name) ?? new Map();
      node.set(name, next);
      node = next;
    }
  }
  return tree.size > 0 ? tree : null;
}

/** The datasets a request with this `expand` reads besides its own, so a route can wait for what they are made from. */
export function expandTargets(
  tree: ExpandTree | null,
  resource: RelatedResource,
  lookup: (name: string) => RelatedResource | undefined,
): RelatedResource[] {
  const found = new Set<RelatedResource>();
  const walk = (node: ExpandTree, at: RelatedResource, relations: Record<string, Relation>): void => {
    for (const [name, subtree] of node) {
      const relation = relations[name];
      if (!relation) continue;
      if (relation.kind === 'items') {
        walk(subtree, at, relation.relations);
        continue;
      }
      const target = lookup(relation.target);
      if (!target) continue;
      found.add(target);
      walk(subtree, target, target.relations ?? {});
    }
  };
  if (tree) walk(tree, resource, resource.relations ?? {});
  return [...found];
}

/** The countries a page of records is about, for a dataset that loads its data country by country: `JP` for `JP-13`. */
export function countriesOfRecords(records: readonly Fields[]): string[] {
  const found = new Set<string>();
  const note = (value: unknown): void => {
    if (typeof value !== 'string') return;
    const match = /^([A-Za-z]{2})(?:-|$)/.exec(value);
    if (match) found.add((match[1] as string).toUpperCase());
  };
  for (const record of records) {
    note(record.country);
    note(record.code);
    for (const value of Object.values(record)) if (Array.isArray(value)) for (const one of value) note(one);
  }
  return [...found];
}

/** Embeds the relations in `tree` into each record: a copy of each record, never the dataset's own. */
export function expandRecords(
  records: readonly Fields[],
  resource: RelatedResource,
  tree: ExpandTree,
  data: RequestData,
): Fields[] {
  return records.map((record) => expandOne(record, resource, tree, data));
}

function expandOne(record: Fields, resource: RelatedResource, tree: ExpandTree, data: RequestData): Fields {
  const relations = resource.relations ?? {};
  if (record === null || typeof record !== 'object') return record;
  const out: Fields = { ...record };
  for (const [name, subtree] of tree) {
    const relation = relations[name];
    if (!relation) continue;
    if (relation.kind === 'items') {
      const items = record[name];
      if (Array.isArray(items)) {
        out[name] = items.map((item) =>
          item && typeof item === 'object'
            ? expandOne(item as Fields, { ...resource, relations: relation.relations }, subtree, data)
            : item,
        );
      }
      continue;
    }
    const target = data.resource(relation.target);
    if (relation.kind === 'one') {
      const key = record[relation.key];
      const at = key === null || key === undefined ? -1 : data.indexOf(target, key);
      data.spend(1);
      out[name] = at < 0 ? null : expandOne(data.present(target, at), target, subtree, data);
    } else if (relation.kind === 'list') {
      const ids = record[relation.key];
      const positions = (Array.isArray(ids) ? ids : []).map((one) => data.indexOf(target, one)).filter((at) => at >= 0);
      data.spend(positions.length);
      out[name] = positions.map((at) => expandOne(data.present(target, at), target, subtree, data));
    } else {
      // A dataset others point at is keyed by its id field: `id` for users, products and posts, `alpha2` for countries.
      const id = record[resource.idField];
      const positions = id === null || id === undefined ? [] : data.childPositions(target, relation.key, id);
      data.spend(positions.length);
      out[name] = positions.map((at) => expandOne(data.present(target, at), target, subtree, data));
    }
  }
  return out;
}
