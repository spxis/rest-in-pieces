/** Response schemas of the bundled domains beyond users and products: invoices, transactions, events and the rest. */
import { z } from '@hono/zod-openapi';

const iso = (description: string) => z.string().datetime().openapi({ description });
const isoOrNull = (description: string) => z.string().datetime().nullable().openapi({ description });
const country = () =>
  z.string().openapi({ description: 'ISO 3166-1 alpha-2 code of the locale the record was written for.' });
const currency = () => z.string().openapi({ description: "ISO 4217 code of the locale's currency.", example: 'CAD' });

export const InvoiceLine = z
  .object({
    description: z.string(),
    quantity: z.number().int(),
    unitPrice: z.number(),
    lineTotal: z.number().openapi({ description: "`quantity × unitPrice`, exact to the currency's smallest unit." }),
  })
  .openapi('InvoiceLine');

export const Invoice = z
  .object({
    id: z.number().int(),
    number: z.string().openapi({ example: 'INV-2025-00042' }),
    invoiceStatus: z.enum(['draft', 'sent', 'paid', 'overdue', 'void']),
    customer: z.string(),
    customerEmail: z.string(),
    city: z.string(),
    country: country(),
    currency: currency(),
    lines: z.array(InvoiceLine),
    subtotal: z.number().openapi({ description: 'The line totals added up.' }),
    taxRate: z.number().openapi({ description: "The locale's headline tax rate, as a fraction." }),
    tax: z.number().openapi({ description: "`subtotal × taxRate`, rounded to the currency's smallest unit." }),
    total: z.number().openapi({ description: '`subtotal + tax`.' }),
    amountDue: z.number().openapi({ description: '`total` while the invoice is sent or overdue, otherwise 0.' }),
    termsDays: z.number().int().openapi({ description: 'Days from `issuedAt` to `dueAt`.' }),
    issuedAt: isoOrNull('Null for a draft.'),
    dueAt: isoOrNull('`issuedAt` plus `termsDays`. An overdue invoice is past it, a sent one is not.'),
    paidAt: isoOrNull('Set only on a paid invoice, from `issuedAt` to ten days after `dueAt`.'),
  })
  .openapi('Invoice');

export const Transaction = z
  .object({
    id: z.number().int(),
    accountId: z.string().openapi({ example: 'ACCT-48210937' }),
    type: z.enum(['card', 'transfer', 'deposit', 'withdrawal', 'fee', 'refund', 'interest']),
    category: z.string(),
    counterparty: z.string(),
    amount: z.number().openapi({ description: 'Negative for money out, positive for money in.' }),
    currency: currency(),
    transactionStatus: z.enum(['pending', 'posted', 'reversed', 'declined']),
    reference: z.string(),
    occurredAt: iso('When it happened.'),
    postedAt: isoOrNull('When it settled: after `occurredAt`. Null while pending and after a decline.'),
  })
  .openapi('Transaction');

export const CalendarEvent = z
  .object({
    id: z.number().int(),
    title: z.string(),
    description: z.string(),
    category: z.enum(['meeting', 'conference', 'appointment', 'social', 'deadline', 'holiday']),
    startsAt: iso('When it starts. Midnight UTC for an all-day event.'),
    endsAt: iso('After `startsAt`. An all-day event ends at midnight after its last day.'),
    allDay: z.boolean(),
    timeZone: z.string().openapi({ description: "An IANA zone for the locale's country.", example: 'America/Toronto' }),
    location: z.string(),
    organizer: z.string(),
    organizerEmail: z.string(),
    attendees: z.number().int(),
    eventStatus: z.enum(['confirmed', 'tentative', 'cancelled']),
    recurrence: z.string().nullable().openapi({ description: 'An iCalendar `RRULE` such as `FREQ=WEEKLY`, or null.' }),
    reminderMinutes: z.number().int(),
    meetingUrl: z.string().nullable().openapi({ description: 'On an example domain, or null.' }),
  })
  .openapi('CalendarEvent');

export const Message = z
  .object({
    id: z.number().int(),
    inReplyTo: z.number().int().nullable().openapi({ description: 'The id of an earlier message this one answers.' }),
    fromName: z.string(),
    fromEmail: z.string(),
    toName: z.string(),
    toEmail: z.string(),
    subject: z.string().openapi({ description: "A reply is `Re: ` and its parent's subject." }),
    body: z.string(),
    sentAt: iso('In id order, and after the message it answers.'),
    readAt: isoOrNull('At or after `sentAt`; null while unread.'),
    read: z.boolean(),
    starred: z.boolean(),
    labels: z.array(z.string()),
    attachments: z.number().int(),
  })
  .openapi('Message');

export const AppNotification = z
  .object({
    id: z.number().int(),
    userId: z.number().int().positive().openapi({ description: 'The recipient in `/users`.' }),
    type: z.enum(['mention', 'comment', 'follow', 'order', 'billing', 'security', 'system']),
    title: z.string(),
    body: z.string(),
    priority: z.enum(['low', 'normal', 'high']),
    channel: z.enum(['in-app', 'email', 'push', 'sms']),
    actionPath: z
      .string()
      .openapi({ description: 'A path on this API the notification is about.', example: '/orders/12' }),
    createdAt: iso('When it was sent.'),
    readAt: isoOrNull('At or after `createdAt`; null while unread.'),
    read: z.boolean(),
  })
  .openapi('Notification');

export const Job = z
  .object({
    id: z.number().int(),
    title: z.string(),
    company: z.string(),
    seniority: z.enum(['junior', 'mid', 'senior', 'lead', 'principal']),
    employmentType: z.enum(['full-time', 'part-time', 'contract', 'internship']),
    workplace: z.enum(['onsite', 'hybrid', 'remote']),
    city: z.string(),
    country: country(),
    currency: currency(),
    salaryMin: z
      .number()
      .int()
      .openapi({ description: 'A yearly salary, below `salaryMax` and rising with `seniority`.' }),
    salaryMax: z.number().int(),
    skills: z.array(z.string()),
    description: z.string(),
    applicants: z.number().int().openapi({ description: 'Grows with how long the posting has been open.' }),
    jobStatus: z.enum(['open', 'paused', 'closed', 'filled']),
    postedAt: iso('When it was posted.'),
    closesAt: iso('After `postedAt`. A closed or filled job closes in the past.'),
  })
  .openapi('Job');

export const Place = z
  .object({
    id: z.number().int(),
    name: z.string(),
    category: z.enum(['cafe', 'restaurant', 'park', 'museum', 'station', 'hotel', 'shop', 'library', 'gym']),
    address: z.string(),
    city: z.string().openapi({ description: "The locale's best-known city; every place is near its centre." }),
    country: country(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    geometry: z
      .object({ type: z.literal('Point'), coordinates: z.tuple([z.number(), z.number()]) })
      .openapi({ description: 'The same point as GeoJSON: `[longitude, latitude]`.' }),
    distanceKm: z.number().openapi({ description: 'Straight-line distance from the city centre, at most 15.' }),
    rating: z.number(),
    priceLevel: z.number().int().min(1).max(4),
    openNow: z.boolean(),
  })
  .openapi('Place');

export const Metric = z
  .object({
    id: z
      .number()
      .int()
      .openapi({ description: 'The index of the point, from 1: its time is the start plus `id - 1` intervals.' }),
    timestamp: iso('Five minutes after the point before it. The series ends at 2026-01-01.'),
    host: z.string(),
    cpuPercent: z.number(),
    memoryPercent: z.number(),
    requestsPerSecond: z.number(),
    latencyMs: z.number().openapi({ description: 'Median latency.' }),
    errorRatePercent: z.number(),
    incident: z
      .boolean()
      .openapi({ description: 'Whether the seed put this point inside an incident: latency and errors up.' }),
  })
  .openapi('Metric');

export const LogLine = z
  .object({
    id: z.number().int(),
    timestamp: iso('Later than the line before it.'),
    level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']),
    service: z.enum(['api', 'auth', 'billing', 'search', 'worker']),
    message: z.string(),
    traceId: z.string(),
    statusCode: z.number().int().nullable().openapi({ description: 'For `api` lines; null for the rest.' }),
    durationMs: z.number().int(),
  })
  .openapi('LogLine');
