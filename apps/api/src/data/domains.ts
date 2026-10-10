/**
 * More bundled domains: invoices, transactions, events, messages, notifications, jobs and places.
 *
 * Each is a seeded dataset like `/companies`: the same seed and locale give the same records, in the locale's
 * currency and country. What makes them useful for testing is that each record agrees with itself. An invoice's
 * lines add up to its total and its dates follow one another; a transaction posts after it happened; an event ends
 * after it starts; a reply to a message comes after the message; a job closes after it was posted and pays more at
 * the top of its range than at the bottom; a place lies near its city. All dates fall around `ANCHOR`, the fixed
 * "now" every seeded dataset uses, so output never moves with the clock.
 *
 * Text is Faker's in the locale's language where it has one and English otherwise: these datasets have no
 * hand-written Japanese.
 */
import type { Faker } from '@faker-js/faker';
import type { CountryLocale } from '../lib/locale.ts';
import { hashOf } from '../lib/safe.ts';
import type { Maker } from './build.ts';
import { ANCHOR } from './presets.ts';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const END = ANCHOR.getTime();

const iso = (time: number) => new Date(time).toISOString();
const pad = (value: number, width: number) => String(value).padStart(width, '0');

/** A moment from `from` to `to`, to the second. If `to` is before `from`, `from`. */
function moment(faker: Faker, from: number, to: number): number {
  const high = Math.max(from, to);
  return Math.floor(faker.number.int({ min: Math.ceil(from / SECOND), max: Math.floor(high / SECOND) }) * SECOND);
}

/** Decimal places the locale's currency is written in: none where one unit is worth a fraction of a cent. */
const decimalsOf = (locale: CountryLocale) => (locale.priceScale >= 100 ? 0 : 2);

/** An amount in the locale's currency from a range in Canadian dollars, to the currency's smallest unit. */
function amount(faker: Faker, locale: CountryLocale, min: number, max: number): number {
  const decimals = decimalsOf(locale);
  const value = faker.number.float({ min: min * locale.priceScale, max: max * locale.priceScale });
  const unit = 10 ** decimals;
  const rounded = Math.round(value * unit) / unit;
  return decimals === 0 && locale.priceScale >= 1000 ? Math.max(100, Math.round(rounded / 100) * 100) : rounded;
}

// ---- invoices -----------------------------------------------------------------------------------------------

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  /** `quantity × unitPrice`. */
  lineTotal: number;
}

export interface Invoice {
  id: number;
  number: string;
  invoiceStatus: InvoiceStatus;
  customer: string;
  customerEmail: string;
  city: string;
  country: string;
  currency: string;
  lines: InvoiceLine[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  /** What is still owed: `total` while an invoice is sent or overdue, otherwise 0. */
  amountDue: number;
  termsDays: number;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
}

export const makeInvoice: Maker<Invoice> = (locale, i) => {
  const { faker, currency, taxRate, country } = locale;
  const decimals = decimalsOf(locale);
  const unit = 10 ** decimals;
  const status = faker.helpers.weightedArrayElement([
    { value: 'paid' as const, weight: 55 },
    { value: 'sent' as const, weight: 18 },
    { value: 'overdue' as const, weight: 14 },
    { value: 'draft' as const, weight: 8 },
    { value: 'void' as const, weight: 5 },
  ]);
  const termsDays = faker.helpers.arrayElement([14, 30, 30, 45, 60]);
  const lines = Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => {
    const quantity = faker.number.int({ min: 1, max: 20 });
    const unitPrice = amount(faker, locale, 5, 400);
    return {
      description: faker.commerce.productName(),
      quantity,
      unitPrice,
      lineMinor: quantity * Math.round(unitPrice * unit),
    };
  });
  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineMinor, 0);
  const taxMinor = Math.round(subtotalMinor * taxRate);
  const money = (minor: number) => Number((minor / unit).toFixed(decimals));
  const total = money(subtotalMinor + taxMinor);

  let issued: number | null = null;
  if (status === 'sent') issued = moment(faker, END - (termsDays - 1) * DAY, END - HOUR);
  else if (status === 'overdue') issued = moment(faker, END - 400 * DAY, END - (termsDays + 1) * DAY);
  else if (status !== 'draft') issued = moment(faker, END - 400 * DAY, END - 2 * DAY);
  const due = issued === null ? null : issued + termsDays * DAY;
  const paid =
    status === 'paid' && issued !== null && due !== null
      ? moment(faker, issued, Math.min(END - HOUR, due + 10 * DAY))
      : null;

  return {
    id: i + 1,
    number: `INV-${new Date(issued ?? END).getUTCFullYear()}-${pad(i + 1, 5)}`,
    invoiceStatus: status,
    customer: faker.company.name(),
    customerEmail: faker.internet.email().toLowerCase(),
    city: faker.location.city(),
    country,
    currency,
    lines: lines.map(({ description, quantity, unitPrice, lineMinor }) => ({
      description,
      quantity,
      unitPrice,
      lineTotal: money(lineMinor),
    })),
    subtotal: money(subtotalMinor),
    taxRate,
    tax: money(taxMinor),
    total,
    amountDue: status === 'sent' || status === 'overdue' ? total : 0,
    termsDays,
    issuedAt: issued === null ? null : iso(issued),
    dueAt: due === null ? null : iso(due),
    paidAt: paid === null ? null : iso(paid),
  };
};

// ---- transactions -------------------------------------------------------------------------------------------

export const TRANSACTION_TYPES = ['card', 'transfer', 'deposit', 'withdrawal', 'fee', 'refund', 'interest'] as const;
export const TRANSACTION_STATUSES = ['pending', 'posted', 'reversed', 'declined'] as const;
const SPENDING = [
  'groceries',
  'dining',
  'transport',
  'utilities',
  'rent',
  'entertainment',
  'health',
  'travel',
  'shopping',
  'subscriptions',
] as const;

export interface Transaction {
  id: number;
  accountId: string;
  type: (typeof TRANSACTION_TYPES)[number];
  category: string;
  counterparty: string;
  /** Negative for money out, positive for money in, in the locale's currency. */
  amount: number;
  currency: string;
  transactionStatus: (typeof TRANSACTION_STATUSES)[number];
  reference: string;
  occurredAt: string;
  /** When it settled: after `occurredAt`, and null while pending or after a decline. */
  postedAt: string | null;
}

export const makeTransaction: Maker<Transaction> = (locale, i) => {
  const { faker, currency } = locale;
  const type = faker.helpers.weightedArrayElement([
    { value: 'card' as const, weight: 55 },
    { value: 'transfer' as const, weight: 10 },
    { value: 'deposit' as const, weight: 10 },
    { value: 'withdrawal' as const, weight: 8 },
    { value: 'fee' as const, weight: 4 },
    { value: 'refund' as const, weight: 5 },
    { value: 'interest' as const, weight: 3 },
  ]);
  const status = faker.helpers.weightedArrayElement([
    { value: 'posted' as const, weight: 88 },
    { value: 'pending' as const, weight: 7 },
    { value: 'reversed' as const, weight: 3 },
    { value: 'declined' as const, weight: 2 },
  ]);
  const credit =
    type === 'deposit' || type === 'refund' || type === 'interest' || (type === 'transfer' && faker.datatype.boolean());
  const size =
    type === 'deposit'
      ? amount(faker, locale, 400, 4000)
      : type === 'fee'
        ? amount(faker, locale, 1, 25)
        : type === 'interest'
          ? amount(faker, locale, 0.5, 20)
          : type === 'withdrawal'
            ? amount(faker, locale, 20, 400)
            : type === 'transfer'
              ? amount(faker, locale, 10, 1500)
              : amount(faker, locale, 2, 300);
  const category =
    type === 'deposit'
      ? 'income'
      : type === 'withdrawal'
        ? 'cash'
        : type === 'fee'
          ? 'fees'
          : type === 'interest'
            ? 'interest'
            : type === 'refund'
              ? 'refund'
              : type === 'transfer'
                ? 'transfer'
                : faker.helpers.arrayElement(SPENDING);
  const counterparty =
    type === 'transfer'
      ? faker.person.fullName()
      : type === 'deposit'
        ? faker.company.name()
        : type === 'withdrawal' || type === 'fee' || type === 'interest'
          ? 'Bank'
          : faker.company.name();
  const occurred =
    status === 'pending' ? moment(faker, END - 3 * DAY, END - HOUR) : moment(faker, END - 120 * DAY, END - 4 * DAY);
  const posted =
    status === 'posted' || status === 'reversed' ? Math.min(END - HOUR, occurred + moment(faker, 0, 3 * DAY)) : null;
  return {
    id: i + 1,
    accountId: `ACCT-${faker.string.numeric(8)}`,
    type,
    category,
    counterparty,
    amount: credit ? size : -size,
    currency,
    transactionStatus: status,
    reference: faker.string.alphanumeric({ length: 12, casing: 'upper' }),
    occurredAt: iso(occurred),
    postedAt: posted === null ? null : iso(posted),
  };
};

// ---- events -------------------------------------------------------------------------------------------------

const TIME_ZONES: Record<string, string> = {
  CA: 'America/Toronto',
  US: 'America/New_York',
  GB: 'Europe/London',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  IN: 'Asia/Kolkata',
  JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul',
  CN: 'Asia/Shanghai',
  BR: 'America/Sao_Paulo',
  MX: 'America/Mexico_City',
  RU: 'Europe/Moscow',
  ID: 'Asia/Jakarta',
  VN: 'Asia/Ho_Chi_Minh',
};

export const EVENT_CATEGORIES = ['meeting', 'conference', 'appointment', 'social', 'deadline', 'holiday'] as const;
const EVENT_NAMES: Record<(typeof EVENT_CATEGORIES)[number], readonly string[]> = {
  meeting: ['planning', 'sync', 'standup', 'review', 'retro', 'kickoff', 'one-on-one', 'demo'],
  conference: ['summit', 'conference', 'workshop', 'expo', 'symposium'],
  appointment: ['check-up', 'consultation', 'interview', 'fitting', 'service visit'],
  social: ['dinner', 'game night', 'birthday', 'picnic', 'meetup', 'reunion'],
  deadline: ['filing due', 'report due', 'submission', 'renewal', 'payment due'],
  holiday: ['office closed', 'public holiday', 'day off', 'long weekend'],
};
const RECURRENCES = [null, 'FREQ=DAILY', 'FREQ=WEEKLY', 'FREQ=MONTHLY', 'FREQ=YEARLY'] as const;

export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  category: (typeof EVENT_CATEGORIES)[number];
  startsAt: string;
  /** After `startsAt`. For an all-day event, midnight at the end of its last day. */
  endsAt: string;
  allDay: boolean;
  timeZone: string;
  location: string;
  organizer: string;
  organizerEmail: string;
  attendees: number;
  eventStatus: 'confirmed' | 'tentative' | 'cancelled';
  /** An iCalendar `RRULE` such as `FREQ=WEEKLY`, or null for a single occurrence. */
  recurrence: string | null;
  reminderMinutes: number;
  meetingUrl: string | null;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const makeEvent: Maker<CalendarEvent> = ({ faker, country }, i) => {
  const category = faker.helpers.weightedArrayElement([
    { value: 'meeting' as const, weight: 40 },
    { value: 'social' as const, weight: 18 },
    { value: 'appointment' as const, weight: 16 },
    { value: 'deadline' as const, weight: 12 },
    { value: 'conference' as const, weight: 8 },
    { value: 'holiday' as const, weight: 6 },
  ]);
  const allDay =
    category === 'holiday' || category === 'deadline' || (category === 'conference' && faker.datatype.boolean());
  const day = Math.floor(moment(faker, END - 30 * DAY, END + 330 * DAY) / DAY) * DAY;
  const startsAt = allDay ? day : day + faker.number.int({ min: 7 * 4, max: 20 * 4 }) * 15 * MINUTE;
  const length = allDay
    ? (category === 'conference' ? faker.number.int({ min: 2, max: 4 }) : 1) * DAY
    : faker.helpers.arrayElement([15, 30, 45, 60, 60, 90, 120, 180]) * MINUTE;
  const organizer = faker.person.fullName();
  const online = category === 'meeting' && faker.datatype.boolean({ probability: 0.5 });
  return {
    id: i + 1,
    title: `${capital(faker.word.adjective())} ${faker.helpers.arrayElement(EVENT_NAMES[category])}`,
    description: faker.lorem.sentence(),
    category,
    startsAt: iso(startsAt),
    endsAt: iso(startsAt + length),
    allDay,
    timeZone: TIME_ZONES[country] ?? 'UTC',
    location: online ? 'Online' : faker.location.city(),
    organizer,
    organizerEmail: faker.internet.email({ firstName: organizer.split(' ')[0] ?? '' }).toLowerCase(),
    attendees:
      category === 'holiday' || category === 'deadline'
        ? 0
        : faker.number.int({ min: 1, max: category === 'conference' ? 400 : 20 }),
    eventStatus: faker.helpers.weightedArrayElement([
      { value: 'confirmed' as const, weight: 80 },
      { value: 'tentative' as const, weight: 14 },
      { value: 'cancelled' as const, weight: 6 },
    ]),
    recurrence: category === 'meeting' ? faker.helpers.arrayElement(RECURRENCES) : null,
    reminderMinutes: faker.helpers.arrayElement([0, 5, 10, 15, 30, 60, 1440]),
    meetingUrl: online ? `https://meet.example.com/${faker.string.alphanumeric({ length: 9, casing: 'lower' })}` : null,
  };
};

// ---- messages -----------------------------------------------------------------------------------------------

const SUBJECTS = [
  'Quarterly numbers',
  'Lunch on Thursday?',
  'Updated schedule',
  'Contract for review',
  'Welcome aboard',
  'Question about the invoice',
  'Photos from the weekend',
  'Reminder: renewal due',
  'Draft agenda',
  'Following up',
  'Can you take a look?',
  'New office hours',
  'Thanks for yesterday',
  'Shipping update',
  'Feedback on the proposal',
  'Access request',
] as const;
const LABELS = ['inbox', 'work', 'personal', 'billing', 'travel', 'receipts'] as const;

/**
 * When a message was sent is a function of its id alone: four hours a message, plus up to three. So messages arrive in
 * id order and a reply, which answers a lower id, is always after the message it answers.
 */
const MESSAGES_START = END - 1002 * 4 * HOUR;
const sentAtOf = (id: number) =>
  MESSAGES_START + id * 4 * HOUR + Math.floor((hashOf(`sent:${id}`) % (3 * HOUR)) / SECOND) * SECOND;

/** The message `id` answers, or null: a function of the id alone, so a reply's whole chain can be followed without building the others. */
export function parentOf(id: number): number | null {
  if (id <= 1 || hashOf(`reply:${id}`) % 100 >= 35) return null;
  return Math.max(1, id - 1 - (hashOf(`parent:${id}`) % 40));
}

/** The first message of the chain `id` belongs to. */
function rootOf(id: number): number {
  let root = id;
  for (let parent = parentOf(root); parent !== null; parent = parentOf(root)) root = parent;
  return root;
}

/** A message is its chain's first subject, and every reply in the chain is `Re:` that. */
export const subjectOf = (id: number): string => {
  const subject = SUBJECTS[hashOf(`subject:${rootOf(id)}`) % SUBJECTS.length] as string;
  return parentOf(id) === null ? subject : `Re: ${subject}`;
};

export interface Message {
  id: number;
  /** The id of the earlier message this one answers, or null. */
  inReplyTo: number | null;
  fromName: string;
  fromEmail: string;
  toName: string;
  toEmail: string;
  /** A reply is `Re:` and the subject of the chain's first message. */
  subject: string;
  body: string;
  /** In id order, and after the message it answers. */
  sentAt: string;
  /** At or after `sentAt`, or null while unread. */
  readAt: string | null;
  read: boolean;
  starred: boolean;
  labels: string[];
  attachments: number;
}

export const makeMessage: Maker<Message> = ({ faker }, i) => {
  const id = i + 1;
  const from = faker.person.fullName();
  const to = faker.person.fullName();
  const sent = sentAtOf(id);
  const read = faker.datatype.boolean({ probability: 0.7 });
  return {
    id,
    inReplyTo: parentOf(id),
    fromName: from,
    fromEmail: faker.internet.email({ firstName: from.split(' ')[0] ?? '' }).toLowerCase(),
    toName: to,
    toEmail: faker.internet.email({ firstName: to.split(' ')[0] ?? '' }).toLowerCase(),
    subject: subjectOf(id),
    body: faker.lorem.sentences({ min: 1, max: 4 }),
    sentAt: iso(sent),
    readAt: read ? iso(Math.min(END - HOUR, sent + faker.number.int({ min: 1, max: 72 * 60 }) * MINUTE)) : null,
    read,
    starred: faker.datatype.boolean({ probability: 0.08 }),
    labels: faker.helpers.arrayElements(LABELS, { min: 1, max: 2 }),
    attachments: faker.datatype.boolean({ probability: 0.15 }) ? faker.number.int({ min: 1, max: 3 }) : 0,
  };
};

// ---- notifications ------------------------------------------------------------------------------------------

export const NOTIFICATION_TYPES = ['mention', 'comment', 'follow', 'order', 'billing', 'security', 'system'] as const;
const NOTIFICATION_TEXT: Record<(typeof NOTIFICATION_TYPES)[number], { title: string; body: string; path: string }> = {
  mention: { title: '{actor} mentioned you', body: '{actor} mentioned you in a post.', path: '/posts/{n}' },
  comment: { title: 'New comment from {actor}', body: '{actor} commented on your post.', path: '/posts/{n}/comments' },
  follow: { title: '{actor} followed you', body: '{actor} started following you.', path: '/users/{n}' },
  order: { title: 'Order #{n} shipped', body: 'Your order #{n} is on its way.', path: '/orders/{n}' },
  billing: { title: 'Invoice {n} is ready', body: 'Invoice {n} is ready to view.', path: '/invoices/{n}' },
  security: { title: 'New sign-in', body: 'Your account was signed in to from a new device.', path: '/auth/me' },
  system: { title: 'Scheduled maintenance', body: 'Maintenance is planned for this weekend.', path: '/health' },
};

export interface AppNotification {
  id: number;
  /** The recipient in `/users`. */
  userId: number;
  type: (typeof NOTIFICATION_TYPES)[number];
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high';
  channel: 'in-app' | 'email' | 'push' | 'sms';
  /** A path on this API the notification is about. */
  actionPath: string;
  createdAt: string;
  /** At or after `createdAt`, or null while unread. */
  readAt: string | null;
  read: boolean;
}

export const makeNotification: Maker<AppNotification> = ({ faker }, i) => {
  const type = faker.helpers.weightedArrayElement([
    { value: 'mention' as const, weight: 18 },
    { value: 'comment' as const, weight: 24 },
    { value: 'follow' as const, weight: 14 },
    { value: 'order' as const, weight: 16 },
    { value: 'billing' as const, weight: 8 },
    { value: 'security' as const, weight: 8 },
    { value: 'system' as const, weight: 12 },
  ]);
  const template = NOTIFICATION_TEXT[type];
  const actor = faker.person.fullName();
  const n = String(faker.number.int({ min: 1, max: 1000 }));
  const fill = (text: string) => text.replaceAll('{actor}', actor).replaceAll('{n}', n);
  const created = moment(faker, END - 60 * DAY, END - MINUTE);
  const read = faker.datatype.boolean({ probability: type === 'security' ? 0.4 : 0.65 });
  return {
    id: i + 1,
    userId: faker.number.int({ min: 1, max: 1000 }),
    type,
    title: fill(template.title),
    body: fill(template.body),
    priority:
      type === 'security'
        ? 'high'
        : type === 'system'
          ? 'low'
          : faker.helpers.arrayElement(['low', 'normal', 'normal']),
    channel: faker.helpers.weightedArrayElement([
      { value: 'in-app' as const, weight: 60 },
      { value: 'email' as const, weight: 20 },
      { value: 'push' as const, weight: 15 },
      { value: 'sms' as const, weight: 5 },
    ]),
    actionPath: fill(template.path),
    createdAt: iso(created),
    readAt: read ? iso(Math.min(END, created + faker.number.int({ min: 1, max: 2000 }) * MINUTE)) : null,
    read,
  };
};

// ---- jobs ---------------------------------------------------------------------------------------------------

const SKILLS = [
  'TypeScript',
  'React',
  'Node.js',
  'Python',
  'SQL',
  'AWS',
  'Docker',
  'Kubernetes',
  'Figma',
  'Excel',
  'Project management',
  'Customer support',
  'Sales',
  'Accounting',
  'Marketing',
  'Data analysis',
  'Go',
  'Java',
  'Accessibility',
  'Technical writing',
] as const;
const LEVELS = [
  { value: 'junior' as const, weight: 25, low: 45_000, high: 70_000 },
  { value: 'mid' as const, weight: 35, low: 70_000, high: 100_000 },
  { value: 'senior' as const, weight: 25, low: 100_000, high: 140_000 },
  { value: 'lead' as const, weight: 10, low: 130_000, high: 175_000 },
  { value: 'principal' as const, weight: 5, low: 160_000, high: 220_000 },
];

export interface Job {
  id: number;
  title: string;
  company: string;
  seniority: 'junior' | 'mid' | 'senior' | 'lead' | 'principal';
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';
  workplace: 'onsite' | 'hybrid' | 'remote';
  city: string;
  country: string;
  currency: string;
  /** A yearly salary in the locale's currency: `salaryMin` is below `salaryMax`, and both rise with seniority. */
  salaryMin: number;
  salaryMax: number;
  skills: string[];
  description: string;
  /** Applications so far: grows with how long the posting has been open. */
  applicants: number;
  jobStatus: 'open' | 'paused' | 'closed' | 'filled';
  postedAt: string;
  /** After `postedAt`. */
  closesAt: string;
}

export const makeJob: Maker<Job> = (locale, i) => {
  const { faker, country, currency, priceScale } = locale;
  const level = faker.helpers.weightedArrayElement(LEVELS.map(({ value, weight }) => ({ value, weight })));
  const band = LEVELS.find((entry) => entry.value === level) ?? (LEVELS[0] as (typeof LEVELS)[number]);
  const step = priceScale >= 100 ? 10_000 : 1000;
  const roundToStep = (value: number) => Math.round(value / step) * step;
  const salaryMin = roundToStep(faker.number.int({ min: band.low, max: band.high }) * priceScale);
  const salaryMax = Math.max(salaryMin + step, roundToStep(salaryMin * faker.number.float({ min: 1.15, max: 1.5 })));
  const postedAt = moment(faker, END - 90 * DAY, END - DAY);
  const closesAt = postedAt + faker.number.int({ min: 14, max: 60 }) * DAY;
  const status =
    closesAt <= END
      ? faker.helpers.arrayElement(['closed', 'filled'] as const)
      : faker.helpers.weightedArrayElement([
          { value: 'open' as const, weight: 90 },
          { value: 'paused' as const, weight: 10 },
        ]);
  const daysOpen = Math.max(1, Math.round((Math.min(END, closesAt) - postedAt) / DAY));
  return {
    id: i + 1,
    title: faker.person.jobTitle(),
    company: faker.company.name(),
    seniority: level,
    employmentType: faker.helpers.weightedArrayElement([
      { value: 'full-time' as const, weight: 72 },
      { value: 'contract' as const, weight: 14 },
      { value: 'part-time' as const, weight: 9 },
      { value: 'internship' as const, weight: 5 },
    ]),
    workplace: faker.helpers.weightedArrayElement([
      { value: 'hybrid' as const, weight: 45 },
      { value: 'onsite' as const, weight: 30 },
      { value: 'remote' as const, weight: 25 },
    ]),
    city: faker.location.city(),
    country,
    currency,
    salaryMin,
    salaryMax,
    skills: faker.helpers.arrayElements(SKILLS, { min: 3, max: 6 }),
    description: faker.lorem.sentences(2),
    applicants: Math.round(daysOpen * faker.number.float({ min: 0.3, max: 6 })),
    jobStatus: status,
    postedAt: iso(postedAt),
    closesAt: iso(closesAt),
  };
};

// ---- places -------------------------------------------------------------------------------------------------

/** Where a locale's places are: its best-known city and that city's centre. */
const CITIES: Record<string, { city: string; latitude: number; longitude: number }> = {
  CA: { city: 'Toronto', latitude: 43.6532, longitude: -79.3832 },
  US: { city: 'New York', latitude: 40.7128, longitude: -74.006 },
  GB: { city: 'London', latitude: 51.5072, longitude: -0.1276 },
  DE: { city: 'Berlin', latitude: 52.52, longitude: 13.405 },
  FR: { city: 'Paris', latitude: 48.8566, longitude: 2.3522 },
  IN: { city: 'Mumbai', latitude: 19.076, longitude: 72.8777 },
  JP: { city: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
  KR: { city: 'Seoul', latitude: 37.5665, longitude: 126.978 },
  CN: { city: 'Shanghai', latitude: 31.2304, longitude: 121.4737 },
  BR: { city: 'São Paulo', latitude: -23.5505, longitude: -46.6333 },
  MX: { city: 'Mexico City', latitude: 19.4326, longitude: -99.1332 },
  RU: { city: 'Moscow', latitude: 55.7558, longitude: 37.6173 },
  ID: { city: 'Jakarta', latitude: -6.2088, longitude: 106.8456 },
  VN: { city: 'Ho Chi Minh City', latitude: 10.8231, longitude: 106.6297 },
};
/** How far from the centre a place may be, in kilometres. */
export const PLACE_RADIUS_KM = 15;

export const PLACE_CATEGORIES = [
  'cafe',
  'restaurant',
  'park',
  'museum',
  'station',
  'hotel',
  'shop',
  'library',
  'gym',
] as const;

export interface Place {
  id: number;
  name: string;
  category: (typeof PLACE_CATEGORIES)[number];
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  /** The same point as GeoJSON, longitude first. */
  geometry: { type: 'Point'; coordinates: [number, number] };
  /** Straight-line distance from the city centre, in kilometres: never more than `PLACE_RADIUS_KM`. */
  distanceKm: number;
  rating: number;
  /** 1 to 4. Parks and libraries are 1. */
  priceLevel: 1 | 2 | 3 | 4;
  openNow: boolean;
}

/** Great-circle distance in kilometres. */
function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const h =
    Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const makePlace: Maker<Place> = ({ faker, country }, i) => {
  const centre = CITIES[country] ?? { city: 'Greenwich', latitude: 51.4769, longitude: 0 };
  const category = faker.helpers.arrayElement(PLACE_CATEGORIES);
  const [latitude, longitude] = faker.location.nearbyGPSCoordinate({
    origin: [centre.latitude, centre.longitude],
    radius: PLACE_RADIUS_KM,
    isMetric: true,
  });
  const lat = Number(latitude.toFixed(5));
  const lon = Number(longitude.toFixed(5));
  const free = category === 'park' || category === 'library';
  return {
    id: i + 1,
    name: `${faker.company.name().split(/[\s,-]/)[0]} ${capital(category)}`,
    category,
    address: faker.location.streetAddress(),
    city: centre.city,
    country,
    latitude: lat,
    longitude: lon,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    distanceKm: Number(haversine(centre.latitude, centre.longitude, lat, lon).toFixed(2)),
    rating: faker.number.float({ min: 2.5, max: 5, fractionDigits: 1 }),
    priceLevel: free ? 1 : (faker.number.int({ min: 1, max: 4 }) as 1 | 2 | 3 | 4),
    openNow: faker.datatype.boolean({ probability: 0.6 }),
  };
};
