/**
 * Safe-by-construction values, for `safe=true`: contact details and addresses that cannot reach anybody,
 * because each comes from a range set aside for examples and fiction.
 *
 * - Emails at `example.com`, `example.org` and `example.net` (RFC 2606), keeping the part before the `@`.
 * - URLs on those domains and their subdomains.
 * - Phone numbers in the ranges regulators reserve for fiction, where a country has one (see `safePhone`).
 * - Payment card numbers only from the test numbers payment processors publish.
 * - IP addresses only from the documentation ranges: 192.0.2.0/24, 198.51.100.0/24 and 203.0.113.0/24
 *   (RFC 5737) and 2001:db8::/32 (RFC 3849).
 * - Avatars and images from this API's own `/avatars` and `/images`, never another host.
 *
 * On by default since 3.0; `safe=false` writes the values 2.x did.
 * These rules make values safe to send, call or load. They are not anonymisation: the data is fake to begin with.
 */
import { flagParam, pick, type Query } from './query.ts';

export const SAFE_DOMAINS = ['example.com', 'example.org', 'example.net'] as const;

/** RFC 5737's three documentation blocks. */
export const SAFE_IPV4_BLOCKS = ['192.0.2', '198.51.100', '203.0.113'] as const;

/**
 * Test card numbers, by network, as Stripe, Braintree and PayPal publish them for sandboxes. Each passes the
 * Luhn check, so a form's validation accepts it, and live payment systems decline it.
 */
export const TEST_CARDS: Readonly<Record<string, readonly string[]>> = {
  visa: ['4111111111111111', '4242424242424242', '4012888888881881'],
  mastercard: ['5555555555554444', '5105105105105100', '2223003122003222'],
  amex: ['378282246310005', '371449635398431'],
  discover: ['6011111111111117', '6011000990139424'],
  jcb: ['3530111333300000', '3566002020360505'],
  diners: ['30569309025904', '38520000023237'],
};
export const ALL_TEST_CARDS = Object.values(TEST_CARDS).flat();

/** Whether a request asks for safe values: `safe=true` (or `1`, `yes`, `on`) in the query, or the app's own default. */
export function wantsSafe(query: Query, fallback: boolean): boolean {
  return flagParam(pick(query, 'safe'), fallback);
}

/** 32-bit FNV-1a with a final mix: the same text always lands on the same choice. */
export function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

const pad = (value: number, width: number) => String(value).padStart(width, '0');

/** An email at one of the example domains, keeping the part before the `@`. The same address always maps the same way. */
export function safeEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const local = (at < 0 ? email : email.slice(0, at)) || 'user';
  const domain = at < 0 ? '' : email.slice(at + 1).toLowerCase();
  if (SAFE_DOMAINS.some((safe) => domain === safe || domain.endsWith(`.${safe}`))) return email;
  return `${local}@${SAFE_DOMAINS[hashOf(email) % SAFE_DOMAINS.length]}`;
}

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Every email inside a longer text (a commit entry, say), moved to the example domains. */
export const safeEmailsIn = (text: string) => text.replace(EMAIL_IN_TEXT, (email) => safeEmail(email));

/** A host name on the example domains: `word.example.com`, or the bare domain when there is no word. */
export function safeHost(word: string, key: number): string {
  const slug = word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '');
  const domain = SAFE_DOMAINS[key % SAFE_DOMAINS.length];
  return slug ? `${slug}.${domain}` : (domain as string);
}

/** North American area codes used with the reserved 555-0100 to 555-0199. */
const NANP_AREAS: Record<string, readonly string[]> = {
  CA: ['416', '604', '403', '613', '514', '902', '306', '204'],
  US: ['212', '415', '312', '206', '617', '303', '512', '305'],
};

/** Ofcom's drama numbers: mobile 07700 900000 to 900999. */
const UK = (n: number) => `07700 900${pad(n % 1000, 3)}`;

/** The Bundesnetzagentur's drama numbers: 1,000 a city in Berlin, Frankfurt, Hamburg, Cologne and Munich. */
const DE_BLOCKS = ['030 23125', '069 90009', '040 66969', '0221 4710', '089 99998'] as const;

/** ARCEP's six fiction blocks of 10,000: five regions and mobile. */
const FR_BLOCKS = ['01 99 00', '02 61 91', '03 53 01', '04 65 71', '05 36 49', '06 39 98'] as const;

/** The countries whose regulator publishes a range of numbers for fiction, which `safePhone` writes in their own form. */
export const FICTION_RANGE_COUNTRIES = ['CA', 'US', 'GB', 'DE', 'FR'] as const;

/**
 * A phone number nobody answers, for a record from `country`. Canada and the US use 555-0100 to 555-0199,
 * which the North American Numbering Plan Administrator keeps for fiction; the UK, Germany and France use
 * their regulators' drama ranges. No such range is published for India, China, Brazil, Russia, Indonesia,
 * Japan, South Korea, Mexico or Vietnam, and a made-up number in their own format may belong to someone,
 * so those records get the North American fiction range in international form, `+1 555-0100` to `+1 555-0199`.
 */
export function safePhone(country: string, key: number): string {
  const two = pad(key % 100, 2);
  const areas = NANP_AREAS[country];
  if (areas) return `${areas[(key >>> 8) % areas.length]}-555-01${two}`;
  if (country === 'GB') return UK(key);
  if (country === 'DE') return `${DE_BLOCKS[(key >>> 10) % DE_BLOCKS.length]}${pad(key % 1000, 3)}`;
  if (country === 'FR') return `${FR_BLOCKS[(key >>> 14) % FR_BLOCKS.length]} ${two} ${pad((key >>> 7) % 100, 2)}`;
  return `+1 555-01${two}`;
}

/** An IPv4 address in one of the three documentation blocks. */
export const safeIpv4 = (key: number) =>
  `${SAFE_IPV4_BLOCKS[key % SAFE_IPV4_BLOCKS.length]}.${1 + ((key >>> 4) % 254)}`;

/** An IPv6 address under 2001:db8::/32. */
export function safeIpv6(key: number): string {
  const groups = Array.from({ length: 6 }, (_, i) =>
    ((Math.imul(key ^ (i * 0x9e3779b1), 0x45d9f3b) >>> 8) & 0xffff).toString(16),
  );
  return `2001:db8:${groups.join(':')}`;
}

/** Where this API's own pictures are served, for absolute links: the origin plus any prefix it is mounted under. */
export function publicBase(url: string, prefix: string | undefined): string {
  const origin = new URL(url).origin;
  const path = (prefix ?? '').trim();
  return /^(\/[\w.~-]+)*\/?$/.test(path) ? `${origin}${path.replace(/\/+$/, '')}` : origin;
}

/** An avatar from `/avatars`: the seed picks the colours, the name the initials. */
export function avatarUrl(base: string, seed: string, name?: string): string {
  const query = name ? `?name=${encodeURIComponent(name)}` : '';
  return `${base}/avatars/${encodeURIComponent(seed)}.svg${query}`;
}

export interface SafeContext {
  /** The API's own address, for avatar links. */
  base: string;
}

type Fields = Record<string, unknown>;

/** Rewrites one record of a built-in dataset. Fields the dataset does not have are left alone. */
type Rewrite = (record: Fields, context: SafeContext) => Fields;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** A dataset whose only unsafe values are the emails in these fields. */
const emailsIn =
  (...fields: string[]): Rewrite =>
  (record) => {
    const safe = { ...record };
    for (const field of fields) if (typeof safe[field] === 'string') safe[field] = safeEmail(safe[field]);
    return safe;
  };

const REWRITES: Record<string, Rewrite> = {
  users: (user, { base }) => {
    const key = hashOf(`${text(user.username)}:${String(user.id)}`);
    const name =
      user.country === 'JP'
        ? `${text(user.lastName)} ${text(user.firstName)}`
        : `${text(user.firstName)} ${text(user.lastName)}`;
    return {
      ...user,
      ...(typeof user.email === 'string' ? { email: safeEmail(user.email) } : {}),
      ...(typeof user.phone === 'string' ? { phone: safePhone(text(user.country), key) } : {}),
      ...('avatar' in user ? { avatar: avatarUrl(base, text(user.username) || String(user.id), name.trim()) } : {}),
    };
  },
  companies: (company) => {
    const key = hashOf(`${text(company.name)}:${String(company.id)}`);
    const site =
      text(company.website)
        .replace(/^https?:\/\//, '')
        .split(/[./]/)[0] ?? '';
    const host = safeHost(site, key);
    return {
      ...company,
      ...(typeof company.website === 'string' ? { website: `https://${host}` } : {}),
      ...(typeof company.email === 'string' ? { email: `hello@${host}` } : {}),
      ...(typeof company.phone === 'string' ? { phone: safePhone(text(company.country), key) } : {}),
    };
  },
  comments: (comment) =>
    typeof comment.email === 'string' ? { ...comment, email: safeEmail(comment.email) } : comment,
  invoices: emailsIn('customerEmail'),
  messages: emailsIn('fromEmail', 'toEmail'),
  events: emailsIn('organizerEmail'),
};

/** Whether a dataset has anything for `safe=true` to rewrite. */
export const hasSafeRewrite = (dataset: string) => dataset in REWRITES;

/** One record with safe values, or the record itself for a dataset with nothing to rewrite. */
export function safeRecord<T extends object>(dataset: string, record: T, context: SafeContext): T {
  const rewrite = REWRITES[dataset];
  return rewrite ? (rewrite(record as Fields, context) as T) : record;
}

/** Every record of a dataset with safe values. */
export function safeRecords<T extends object>(dataset: string, records: readonly T[], context: SafeContext): T[] {
  const rewrite = REWRITES[dataset];
  return rewrite ? records.map((record) => rewrite(record as Fields, context) as T) : [...records];
}
