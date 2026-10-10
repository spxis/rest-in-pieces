/**
 * Time series, metrics and logs: records that are a pure function of the seed and the time index.
 *
 * Record `i` of `/metrics` or `/logs` is worked out from `(seed, i)` alone, with no state carried from the record
 * before: the same seed gives the same series, any record can be computed without the others, and nothing here
 * reads the clock. Time starts at a fixed moment and runs forward by index, so the series is the same today as it
 * will be next year.
 */
import { MAX_RECORDS } from '../lib/collection.ts';
import { ANCHOR } from './presets.ts';
import { mix, stream } from './random.ts';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

/** Keeps each series' streams apart from the other datasets' and from each other. */
const KEYS = { metrics: 31, logs: 32, incident: 33, base: 34 } as const;

const iso = (time: number) => new Date(time).toISOString();
const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

// ---- metrics ------------------------------------------------------------------------------------------------

/** Seconds between two points of `/metrics`. */
export const METRIC_INTERVAL_SECONDS = 300;
/** The first point: the series ends at the anchor that every seeded dataset treats as now. */
export const METRICS_START = ANCHOR.getTime() - MAX_RECORDS * METRIC_INTERVAL_SECONDS * SECOND;
/** An incident is a window of this many points where a service is slow and failing. */
export const INCIDENT_POINTS = 6;
const INCIDENT_PERIOD = 144;

export interface Metric {
  id: number;
  /** `METRICS_START` plus `id - 1` intervals of 5 minutes. */
  timestamp: string;
  host: string;
  cpuPercent: number;
  memoryPercent: number;
  requestsPerSecond: number;
  /** Median latency in milliseconds. */
  latencyMs: number;
  errorRatePercent: number;
  /** Whether this point is inside an incident the seed placed: latency up, errors up. */
  incident: boolean;
}

/**
 * Whether point `index` is inside an incident. One window of `INCIDENT_POINTS` points starts somewhere in each block
 * of 144 points (half a day); the seed decides where, and whether the block has one at all (about two blocks in three).
 */
export function inIncident(seed: number, index: number): boolean {
  const block = Math.floor(index / INCIDENT_PERIOD);
  const random = stream(mix(seed, KEYS.incident, block));
  if (random.next() > 0.66) return false;
  const start = block * INCIDENT_PERIOD + random.int(0, INCIDENT_PERIOD - INCIDENT_POINTS);
  return index >= start && index < start + INCIDENT_POINTS;
}

/** One point of the series. A pure function of the seed and the index. */
export function metricAt(seed: number, index: number): Metric {
  const base = stream(mix(seed, KEYS.base));
  const level = {
    cpu: base.int(25, 55),
    memory: base.int(40, 70),
    traffic: base.int(80, 600),
    latency: base.int(30, 140),
  };
  const host = `web-${base.int(1, 8)}`;
  const random = stream(mix(seed, KEYS.metrics, index));
  const time = METRICS_START + index * METRIC_INTERVAL_SECONDS * SECOND;
  // Office hours push traffic up and quiet nights down: a daily wave, high mid-afternoon.
  const wave = Math.sin(((time % DAY) / DAY) * 2 * Math.PI - Math.PI / 2 - 0.9);
  const incident = inIncident(seed, index);
  const traffic = Math.max(1, level.traffic * (1 + 0.45 * wave) * (0.9 + random.next() * 0.2));
  const load = traffic / level.traffic;
  const cpu = clamp(level.cpu * (0.7 + 0.3 * load) + (random.next() - 0.5) * 8 + (incident ? 25 : 0), 1, 100);
  const memory = clamp(level.memory + (index % 288) * 0.02 + (random.next() - 0.5) * 3, 5, 99);
  const latency = Math.max(1, level.latency * (0.8 + 0.2 * load) * (0.9 + random.next() * 0.3) * (incident ? 4 : 1));
  const errors = clamp((0.15 + random.next() * 0.25) * (incident ? 12 : 1), 0, 100);
  return {
    id: index + 1,
    timestamp: iso(time),
    host,
    cpuPercent: round(cpu, 1),
    memoryPercent: round(memory, 1),
    requestsPerSecond: round(traffic, 1),
    latencyMs: round(latency, 1),
    errorRatePercent: round(errors, 2),
    incident,
  };
}

export const metricsFor = (seed: number, count = MAX_RECORDS): Metric[] =>
  Array.from({ length: count }, (_, index) => metricAt(seed, index));

// ---- logs ---------------------------------------------------------------------------------------------------

/** Average seconds between log lines. */
export const LOG_INTERVAL_SECONDS = 15;
export const LOGS_START = ANCHOR.getTime() - MAX_RECORDS * LOG_INTERVAL_SECONDS * SECOND;
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
export const LOG_SERVICES = ['api', 'auth', 'billing', 'search', 'worker'] as const;
type Level = (typeof LOG_LEVELS)[number];
type Service = (typeof LOG_SERVICES)[number];

const MESSAGES: Record<Service, Record<Level, readonly string[]>> = {
  api: {
    debug: ['cache hit for {path}', 'parsed request body ({n} bytes)'],
    info: ['GET {path} completed', 'POST {path} completed', 'request {id} served'],
    warn: ['slow response for {path}', 'rate limit close for client {id}'],
    error: ['upstream timeout calling {path}', 'unhandled error on {path}'],
    fatal: ['listener closed unexpectedly'],
  },
  auth: {
    debug: ['token {id} verified'],
    info: ['user {n} signed in', 'session {id} refreshed'],
    warn: ['failed sign-in for user {n}', 'token {id} close to expiry'],
    error: ['could not verify token {id}', 'directory unreachable'],
    fatal: ['signing key unavailable'],
  },
  billing: {
    debug: ['loaded {n} line items'],
    info: ['invoice {n} created', 'payment {id} captured'],
    warn: ['retrying payment {id}', 'tax rate missing for order {n}'],
    error: ['payment {id} declined', 'invoice {n} failed to render'],
    fatal: ['ledger write failed'],
  },
  search: {
    debug: ['query planned in {n} ms'],
    info: ['index {id} refreshed', 'query served in {n} ms'],
    warn: ['index {id} lagging by {n} seconds', 'query over {n} results truncated'],
    error: ['shard {n} did not answer', 'query {id} timed out'],
    fatal: ['index corrupt'],
  },
  worker: {
    debug: ['picked job {id}', 'queue depth {n}'],
    info: ['job {id} finished', 'queue drained'],
    warn: ['job {id} retried ({n} of 5)', 'queue depth {n} above target'],
    error: ['job {id} failed', 'dead letter after {n} attempts'],
    fatal: ['worker pool exhausted'],
  },
};
const PATHS = ['/users', '/orders', '/products', '/invoices', '/search', '/health', '/auth/me'] as const;

export interface LogLine {
  id: number;
  /** Always later than the line before it: a line is `id - 1` intervals of about 15 seconds on, plus under 10 seconds of jitter. */
  timestamp: string;
  level: Level;
  service: Service;
  message: string;
  traceId: string;
  /** For `api` lines only. */
  statusCode: number | null;
  durationMs: number;
}

const hex = (random: ReturnType<typeof stream>, length: number) =>
  Array.from({ length }, () => random.int(0, 15).toString(16)).join('');

/** One log line. A pure function of the seed and the index. */
export function logAt(seed: number, index: number): LogLine {
  const random = stream(mix(seed, KEYS.logs, index));
  const level = LOG_LEVELS[random.weighted([14, 60, 15, 9, 2]) as number] as Level;
  const service = random.pick(LOG_SERVICES);
  const template = random.pick(MESSAGES[service][level]);
  const id = hex(random, 8);
  const message = template
    .replaceAll('{path}', random.pick(PATHS))
    .replaceAll('{id}', id)
    .replaceAll('{n}', String(random.int(1, 999)));
  const failing = level === 'error' || level === 'fatal';
  const statusCode =
    service === 'api'
      ? failing
        ? random.pick([500, 502, 503, 504])
        : level === 'warn'
          ? random.pick([200, 429, 404])
          : random.pick([200, 200, 200, 201, 204, 304])
      : null;
  return {
    id: index + 1,
    timestamp: iso(LOGS_START + index * LOG_INTERVAL_SECONDS * SECOND + random.int(0, 9) * SECOND),
    level,
    service,
    message,
    traceId: hex(random, 16),
    statusCode,
    durationMs: Math.max(1, Math.round(Math.exp(Math.log(failing ? 900 : 60) + (random.next() - 0.5) * 2.2))),
  };
}

export const logsFor = (seed: number, count = MAX_RECORDS): LogLine[] =>
  Array.from({ length: count }, (_, index) => logAt(seed, index));
