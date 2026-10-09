/**
 * Small seeded randomness for the related datasets. Every record draws from a stream of its own, keyed by the
 * seed, the dataset and the record's position, so a record never depends on the ones built before it and any
 * part of a dataset can be worked out without building the rest.
 */

/** Mixes numbers into one 32-bit key, the same on every machine. */
export function mix(...parts: readonly number[]): number {
  let h = 0x9e3779b9;
  for (const part of parts) {
    h = Math.imul(h ^ (part >>> 0), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** A source of numbers in [0, 1), and the helpers the builders use on it. */
export interface Stream {
  next(): number;
  /** An integer from `min` to `max`, both included. */
  int(min: number, max: number): number;
  /** One of `items`. */
  pick<T>(items: readonly T[]): T;
  /** An index into `weights`, drawn in proportion to them. */
  weighted(weights: readonly number[]): number;
  /** True with this probability. */
  chance(probability: number): boolean;
}

/** mulberry32: tiny, fast and good enough to choose counts, picks and dates. */
export function stream(seed: number): Stream {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)] as T,
    weighted(weights) {
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let at = next() * total;
      for (let i = 0; i < weights.length; i++) {
        at -= weights[i] ?? 0;
        if (at < 0) return i;
      }
      return weights.length - 1;
    },
    chance: (probability) => next() < probability,
  };
}
