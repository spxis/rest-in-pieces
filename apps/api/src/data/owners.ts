/**
 * Who owns what. Each parent record owns a seeded number of children: user `k` has some orders, posts and
 * todos, post `p` some comments, product `j` some reviews. The counts depend on the seed alone (never the
 * locale), so a relation reads the same in every language, and one prefix sum per seed turns them into id
 * ranges: the children of parent `k` are the records from `starts[k - 1]` to `starts[k] - 1`, found by
 * arithmetic, never by a scan. A nested route therefore costs what a page of the child dataset costs.
 */
import { MAX_RECORDS } from '../lib/collection.ts';
import { mix, stream } from './random.ts';

/** How many children a parent may have, by weight: index `n` is the weight of having `n` children. */
export const OWNERSHIP = {
  /** Orders per user: about 1.6 on average, at most 5. */
  orders: { parent: 'users', key: 1, weights: [25, 30, 20, 12, 8, 5] },
  /** Posts per user: about 1.3 on average, at most 5. */
  posts: { parent: 'users', key: 2, weights: [40, 25, 15, 10, 6, 4] },
  /** Todos per user: about 4 on average, at most 8. */
  todos: { parent: 'users', key: 3, weights: [6, 8, 10, 13, 14, 14, 13, 12, 10] },
  /** Comments per post: about 2.5 on average, at most 6. */
  comments: { parent: 'posts', key: 4, weights: [12, 18, 20, 18, 14, 10, 8] },
  /** Reviews per product: about 2.3 on average, at most 6. */
  reviews: { parent: 'products', key: 5, weights: [20, 20, 20, 15, 10, 10, 5] },
} as const;

export type OwnedDataset = keyof typeof OWNERSHIP;

/**
 * The first ten parents always own at least one child, so `/users/1/posts`, `/posts/1/comments` and
 * `/products/1/reviews` (what tutorials ask for first) are never empty.
 */
export const ALWAYS_OWNING = 10;

/** The most children any parent has in a dataset: the bound on an embedded list. */
export const MOST_CHILDREN = Math.max(...Object.values(OWNERSHIP).map((o) => o.weights.length - 1));

export interface Ownership {
  /** `starts[k]` is how many children parents 1 to `k` own together; `starts[0]` is 0. */
  starts: Int32Array;
  /** Children in all. */
  total: number;
}

const known = new Map<string, Ownership>();

function count(seed: number, dataset: OwnedDataset, parents: number): Ownership {
  const { key, weights } = OWNERSHIP[dataset];
  const starts = new Int32Array(parents + 1);
  const some = weights.slice(1);
  for (let k = 1; k <= parents; k++) {
    const random = stream(mix(seed, key, k));
    let children = random.weighted(weights);
    if (children === 0 && k <= ALWAYS_OWNING) children = 1 + random.weighted(some);
    starts[k] = (starts[k - 1] ?? 0) + children;
  }
  return { starts, total: starts[parents] ?? 0 };
}

/** The id ranges of a dataset's children at a seed, worked out once and kept. */
export function ownership(seed: number, dataset: OwnedDataset): Ownership {
  const id = `${dataset}:${seed}`;
  const hit = known.get(id);
  if (hit) return hit;
  const parents = dataset === 'comments' ? ownership(seed, 'posts').total : MAX_RECORDS;
  const made = count(seed, dataset, parents);
  if (known.size >= 160) known.delete(known.keys().next().value as string);
  known.set(id, made);
  return made;
}

/** The ids of parent `parentId`'s children, as a half-open range of positions in the child dataset. */
export function childRange(owned: Ownership, parentId: number): [number, number] | null {
  if (!Number.isInteger(parentId) || parentId < 1 || parentId >= owned.starts.length) return null;
  return [owned.starts[parentId - 1] ?? 0, owned.starts[parentId] ?? 0];
}

/** The parent of the child at position `index`: a binary search over the prefix sum. */
export function parentAt(owned: Ownership, index: number): number {
  let low = 1;
  let high = owned.starts.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((owned.starts[middle] ?? 0) > index) high = middle;
    else low = middle + 1;
  }
  return low;
}
