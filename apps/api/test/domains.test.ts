import { describe, expect, it } from 'vitest';
import { PLACE_RADIUS_KM } from '../src/data/domains.ts';
import {
  INCIDENT_POINTS,
  inIncident,
  LOG_INTERVAL_SECONDS,
  logAt,
  logsFor,
  METRIC_INTERVAL_SECONDS,
  METRICS_START,
  metricAt,
  metricsFor,
} from '../src/data/series.ts';
import { LOCALE_CODES } from '../src/lib/locale.ts';
import { resourceNamed } from '../src/resources.ts';
import { type Envelope, request } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: records are read by field name
type Row = Record<string, any>;

const NEW = ['invoices', 'transactions', 'events', 'messages', 'notifications', 'jobs', 'places', 'metrics', 'logs'];
const END = Date.parse('2026-01-01T00:00:00Z');
const time = (value: unknown) => Date.parse(value as string);

const all = async (name: string, query = '') =>
  (await request<Envelope<Row>>(`/${name}?limit=1000&${query}`)).body.results;

const matrix = [
  ['seed=1&locale=en-CA'],
  ['seed=7&locale=ja'],
  ['seed=99&locale=global'],
  ['seed=3&locale=de'],
  ['seed=5&locale=en-IN'],
] as const;

describe('the bundled domains', () => {
  it('are listed with their fields, and each serves lists, items, formats and the simulation', async () => {
    const { body } = await request<{ name: string; fields: string[]; writable: boolean }[]>('/resources');
    for (const name of NEW) {
      const entry = body.find((resource) => resource.name === name);
      expect(entry?.fields.length, name).toBeGreaterThan(5);
      expect(entry?.writable, name).toBe(false);
      const list = await request<Envelope<Row>>(`/${name}?limit=3&seed=2`);
      expect(list.status, name).toBe(200);
      expect(list.body.results).toHaveLength(3);
      expect(Object.keys(list.body.results[0] ?? {})).toEqual(entry?.fields);
      const item = await request<Row>(`/${name}/2?seed=2`);
      expect(item.body).toEqual(list.body.results[1]);
      expect((await request(`/${name}/99999`)).status).toBe(404);
      expect((await request(`/${name}?limit=2&format=csv`)).text).toContain('id,');
      expect((await request(`/${name}?limit=2&format=ndjson`)).text.trim().split('\n')).toHaveLength(2);
      expect((await request(`/${name}?limit=1&format=sql`)).text).toContain(`INSERT INTO "${name}"`);
      expect((await request(`/${name}?status=503`)).status).toBe(503);
      expect(
        (await request(`/${name}`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }))
          .status,
      ).toBe(404);
    }
  });

  it('give the same records for the same seed and different ones for another', async () => {
    for (const name of NEW) {
      const a = await all(name, 'seed=4');
      expect(await all(name, 'seed=4'), name).toEqual(a);
      expect(await all(name, 'seed=5'), name).not.toEqual(a);
      expect(a, name).toHaveLength(1000);
      expect(new Set(a.map((row) => row.id)).size).toBe(1000);
    }
  });

  it('filter, sort and search like every other dataset', async () => {
    const paid = (await request<Envelope<Row>>('/invoices?invoiceStatus=paid&limit=1000')).body;
    expect(paid.results.length).toBeGreaterThan(400);
    expect(paid.results.every((row) => row.invoiceStatus === 'paid')).toBe(true);
    const sorted = (await request<Envelope<Row>>('/places?sortBy=distanceKm:numeric&limit=50')).body.results;
    expect(sorted.map((row) => row.distanceKm)).toEqual(sorted.map((row) => row.distanceKm).toSorted((a, b) => a - b));
    expect(
      (await request<Envelope<Row>>('/logs?level=error&limit=5')).body.results.every((row) => row.level === 'error'),
    ).toBe(true);
    expect((await request<Envelope<Row>>('/jobs?q=remote&limit=5')).status).toBe(200);
    expect((await request<Envelope<Row>>('/messages?inReplyTo[gt]=0&limit=1000')).body.metadata.total).toBeGreaterThan(
      200,
    );
  });

  it('serve safe emails', async () => {
    for (const [name, field] of [
      ['invoices', 'customerEmail'],
      ['messages', 'fromEmail'],
      ['messages', 'toEmail'],
      ['events', 'organizerEmail'],
    ] as const) {
      const rows = (await request<Envelope<Row>>(`/${name}?limit=200&safe=true`)).body.results;
      for (const row of rows) expect(row[field], `${name}.${field}`).toMatch(/@example\.(com|org|net)$/);
    }
  });
});

describe.each(matrix)('records agree with themselves (%s)', (query) => {
  it('invoices add up and their dates follow one another', async () => {
    const rows = await all('invoices', query);
    const currencies = new Set<string>();
    for (const row of rows) {
      const unit =
        row.currency === 'JPY' || row.currency === 'KRW' || row.currency === 'IDR' || row.currency === 'VND' ? 1 : 100;
      currencies.add(row.currency);
      expect(row.lines.length).toBeGreaterThanOrEqual(1);
      let sum = 0;
      for (const line of row.lines) {
        expect(Math.round(line.lineTotal * unit)).toBe(Math.round(line.quantity * line.unitPrice * unit));
        sum += Math.round(line.lineTotal * unit);
      }
      expect(Math.round(row.subtotal * unit)).toBe(sum);
      expect(Math.round(row.tax * unit)).toBe(Math.round(sum * row.taxRate));
      expect(Math.round(row.total * unit)).toBe(Math.round(row.subtotal * unit) + Math.round(row.tax * unit));
      expect(row.amountDue).toBe(row.invoiceStatus === 'sent' || row.invoiceStatus === 'overdue' ? row.total : 0);
      if (row.invoiceStatus === 'draft') {
        expect([row.issuedAt, row.dueAt, row.paidAt]).toEqual([null, null, null]);
        continue;
      }
      expect(time(row.dueAt) - time(row.issuedAt)).toBe(row.termsDays * 86_400_000);
      if (row.invoiceStatus === 'sent') expect(time(row.dueAt)).toBeGreaterThan(END);
      if (row.invoiceStatus === 'overdue') expect(time(row.dueAt)).toBeLessThan(END);
      if (row.invoiceStatus === 'paid') {
        expect(time(row.paidAt)).toBeGreaterThanOrEqual(time(row.issuedAt));
        expect(time(row.paidAt)).toBeLessThan(END);
      } else expect(row.paidAt).toBeNull();
    }
    expect(currencies.size).toBeGreaterThanOrEqual(1);
  });

  it('transactions post after they happen, with the right sign', async () => {
    for (const row of await all('transactions', query)) {
      if (row.postedAt !== null) {
        expect(time(row.postedAt)).toBeGreaterThanOrEqual(time(row.occurredAt));
        expect(['posted', 'reversed']).toContain(row.transactionStatus);
      } else expect(['pending', 'declined']).toContain(row.transactionStatus);
      if (['deposit', 'refund', 'interest'].includes(row.type)) expect(row.amount).toBeGreaterThan(0);
      if (['card', 'withdrawal', 'fee'].includes(row.type)) expect(row.amount).toBeLessThan(0);
    }
  });

  it('events end after they start, all-day ones on midnights', async () => {
    for (const row of await all('events', query)) {
      expect(time(row.endsAt)).toBeGreaterThan(time(row.startsAt));
      if (row.allDay) {
        expect(time(row.startsAt) % 86_400_000).toBe(0);
        expect(time(row.endsAt) % 86_400_000).toBe(0);
      }
      if (row.recurrence !== null) expect(row.category).toBe('meeting');
      expect(row.timeZone).toMatch(/^[A-Z][A-Za-z_]+\/[A-Za-z_]+$|^UTC$/);
    }
  });

  it('replies come after the message they answer', async () => {
    const rows = await all('messages', query);
    const byId = new Map(rows.map((row) => [row.id, row]));
    let replies = 0;
    for (const row of rows) {
      if (row.inReplyTo !== null) {
        replies++;
        const parent = byId.get(row.inReplyTo);
        expect(parent, `message ${row.id}`).toBeDefined();
        expect(row.inReplyTo).toBeLessThan(row.id);
        expect(time(row.sentAt)).toBeGreaterThan(time(parent?.sentAt));
        expect(row.subject).toBe(`Re: ${parent?.subject.replace(/^Re: /, '')}`);
      }
      if (row.readAt !== null) expect(time(row.readAt)).toBeGreaterThanOrEqual(time(row.sentAt));
      expect(row.read).toBe(row.readAt !== null);
    }
    expect(replies).toBeGreaterThan(200);
    const sent = rows.map((row) => time(row.sentAt));
    expect(sent).toEqual(sent.toSorted((a, b) => a - b));
  });

  it('notifications name real users and read after they are sent', async () => {
    for (const row of await all('notifications', query)) {
      expect(row.userId).toBeGreaterThanOrEqual(1);
      expect(row.userId).toBeLessThanOrEqual(1000);
      if (row.readAt !== null) expect(time(row.readAt)).toBeGreaterThanOrEqual(time(row.createdAt));
      expect(row.read).toBe(row.readAt !== null);
      expect(row.actionPath).not.toContain('{');
      expect(row.title).not.toContain('{');
    }
  });

  it('jobs close after they open and pay more at the top of the range', async () => {
    const rows = await all('jobs', query);
    for (const row of rows) {
      expect(row.salaryMax).toBeGreaterThan(row.salaryMin);
      expect(time(row.closesAt)).toBeGreaterThan(time(row.postedAt));
      if (row.jobStatus === 'closed' || row.jobStatus === 'filled') expect(time(row.closesAt)).toBeLessThanOrEqual(END);
      else expect(time(row.closesAt)).toBeGreaterThan(END);
      expect(row.skills.length).toBeGreaterThanOrEqual(3);
    }
    const mean = (level: string) => {
      const group = rows.filter((row) => row.seniority === level);
      return group.reduce((sum, row) => sum + row.salaryMin, 0) / group.length;
    };
    expect(mean('principal')).toBeGreaterThan(mean('junior') * 2);
  });

  it('places lie near their city, with matching GeoJSON', async () => {
    for (const row of await all('places', query)) {
      expect(row.latitude).toBeGreaterThanOrEqual(-90);
      expect(row.latitude).toBeLessThanOrEqual(90);
      expect(row.longitude).toBeGreaterThanOrEqual(-180);
      expect(row.longitude).toBeLessThanOrEqual(180);
      expect(row.geometry).toEqual({ type: 'Point', coordinates: [row.longitude, row.latitude] });
      expect(row.distanceKm).toBeLessThanOrEqual(PLACE_RADIUS_KM + 0.5);
      if (row.category === 'park' || row.category === 'library') expect(row.priceLevel).toBe(1);
    }
  });
});

describe('time series are a pure function of the seed and the index', () => {
  it('give each point from the seed and its position alone', async () => {
    const rows = await all('metrics', 'seed=9');
    for (const index of [0, 1, 500, 999]) expect(rows[index]).toEqual(metricAt(9, index));
    expect(metricsFor(9, 20)).toEqual(rows.slice(0, 20));
    // Any locale gives the same series, and the first point can be worked out alone.
    expect(await all('metrics', 'seed=9&locale=ja')).toEqual(rows);
    const lines = await all('logs', 'seed=9&locale=de');
    expect(lines).toEqual(await all('logs', 'seed=9'));
    expect(lines[640]).toEqual(logAt(9, 640));
    expect(logsFor(9, 5)).toEqual(lines.slice(0, 5));
  });

  it('keep time moving forward at a fixed step, ending at the anchor', async () => {
    const rows = await all('metrics', 'seed=2');
    rows.forEach((row, index) => {
      expect(time(row.timestamp)).toBe(METRICS_START + index * METRIC_INTERVAL_SECONDS * 1000);
    });
    expect(time(rows[999]?.timestamp)).toBeLessThan(END);
    const lines = await all('logs', 'seed=2');
    for (let i = 1; i < lines.length; i++) {
      expect(time(lines[i]?.timestamp)).toBeGreaterThan(time(lines[i - 1]?.timestamp));
      expect(time(lines[i]?.timestamp) - time(lines[i - 1]?.timestamp)).toBeLessThan(2 * LOG_INTERVAL_SECONDS * 1000);
    }
    expect(time(lines[999]?.timestamp)).toBeLessThan(END);
  });

  it('keep every metric in range, with incidents that hurt', async () => {
    const rows = await all('metrics', 'seed=3');
    for (const row of rows) {
      for (const key of ['cpuPercent', 'memoryPercent']) {
        expect(row[key]).toBeGreaterThanOrEqual(0);
        expect(row[key]).toBeLessThanOrEqual(100);
      }
      expect(row.requestsPerSecond).toBeGreaterThan(0);
      expect(row.latencyMs).toBeGreaterThan(0);
      expect(row.errorRatePercent).toBeGreaterThanOrEqual(0);
      expect(row.errorRatePercent).toBeLessThanOrEqual(100);
    }
    const mean = (list: Row[], key: string) => list.reduce((sum, row) => sum + row[key], 0) / list.length;
    const during = rows.filter((row) => row.incident);
    const outside = rows.filter((row) => !row.incident);
    expect(during.length).toBeGreaterThan(0);
    expect(during.length).toBeLessThan(rows.length / 4);
    expect(mean(during, 'latencyMs')).toBeGreaterThan(mean(outside, 'latencyMs') * 2);
    expect(mean(during, 'errorRatePercent')).toBeGreaterThan(mean(outside, 'errorRatePercent') * 4);
    expect(rows.map((row) => row.host)).toEqual(Array(1000).fill(rows[0]?.host));
  });

  it('place incidents in blocks, a short window each', () => {
    let points = 0;
    for (let index = 0; index < 1000; index++) if (inIncident(5, index)) points++;
    expect(points).toBeGreaterThan(0);
    expect(points % 1).toBe(0);
    expect(points).toBeLessThanOrEqual(Math.ceil(1000 / 144) * INCIDENT_POINTS);
  });

  it('make logs with consistent levels, services and status codes', async () => {
    const lines = await all('logs', 'seed=6');
    const levels = new Map<string, number>();
    for (const line of lines) {
      levels.set(line.level, (levels.get(line.level) ?? 0) + 1);
      expect(line.message).not.toMatch(/\{/);
      expect(line.traceId).toMatch(/^[0-9a-f]{16}$/);
      if (line.service === 'api') expect(line.statusCode).not.toBeNull();
      else expect(line.statusCode).toBeNull();
      if (line.service === 'api' && (line.level === 'error' || line.level === 'fatal'))
        expect(line.statusCode).toBeGreaterThanOrEqual(500);
      expect(line.durationMs).toBeGreaterThanOrEqual(1);
    }
    expect(levels.get('info') ?? 0).toBeGreaterThan(levels.get('error') ?? 0);
    expect(levels.get('error') ?? 0).toBeGreaterThan(levels.get('fatal') ?? 0);
  });
});

describe('every locale', () => {
  it('serves every new dataset', async () => {
    for (const locale of [...LOCALE_CODES, 'global']) {
      for (const name of NEW) {
        const { status, body } = await request<Envelope<Row>>(`/${name}?locale=${locale}&limit=3`);
        expect(status, `${name} ${locale}`).toBe(200);
        expect(body.results, `${name} ${locale}`).toHaveLength(3);
      }
    }
    expect(resourceNamed('invoices')?.title).toBe('Invoice');
  });
});
