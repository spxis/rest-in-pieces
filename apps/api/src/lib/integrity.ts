/**
 * Keeping relations whole on writes: a write must name records that exist, an order's prices and totals are
 * worked out by the server, and with the session on a delete takes the records that point at it along.
 */
import { globalLocales } from '../data/build.ts';
import { MAX_RECORDS } from './collection.ts';
import { type CountryLocale, countryLocale, GLOBAL, LOCALES } from './locale.ts';
import type { RelatedResource, RequestData } from './relations.ts';

type Fields = Record<string, unknown>;

/** What a write's body becomes: the fields to keep, or a message per field that is wrong. */
export type Derived = { record: Fields } | { errors: Record<string, string> };

/** Works out the fields the server sets on a write. `existing` is the record a `PUT` or `PATCH` changes. */
export type Derive = (sent: Fields, existing: Fields | undefined, data: RequestData) => Derived;

/** A dataset that points at others, as `checkReferences` and `cascade` need it. */
export interface Referring extends RelatedResource {
  references?: Readonly<Record<string, string>>;
}

/** One message per reference that names no record, keyed by the field: `{ userId: 'No user with id 5000.' }`. */
export function checkReferences(resource: Referring, record: Fields, data: RequestData): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, target] of Object.entries(resource.references ?? {})) {
    const value = record[key];
    if (value === undefined) continue;
    const found = data.resource(target);
    if (data.indexOf(found, value) < 0) errors[key] = `No ${singular(target)} with id ${String(value)}.`;
  }
  return errors;
}

const singular = (name: string) => name.replace(/ies$/, 'y').replace(/s$/, '');

/**
 * Everything a delete takes with it, by dataset: the record itself, every record whose reference names it, and
 * so on down (a user's posts, and those posts' comments). Read from the session's own copies, so a record created
 * in this session and pointing at the one deleted goes too.
 */
export function cascade(
  resource: Referring,
  id: unknown,
  data: RequestData,
  all: readonly Referring[],
): Map<Referring, Set<string>> {
  const plan = new Map<Referring, Set<string>>([[resource, new Set([String(id)])]]);
  const queue: Array<[Referring, Set<string>]> = [[resource, new Set([String(id)])]];
  while (queue.length > 0) {
    const [parent, ids] = queue.shift() as [Referring, Set<string>];
    for (const child of all) {
      for (const [key, target] of Object.entries(child.references ?? {})) {
        if (target !== parent.name) continue;
        const found = new Set<string>();
        for (const record of data.records(child)) {
          if (ids.has(String(record[key]))) found.add(String(record[child.idField]));
        }
        const known = plan.get(child) ?? new Set();
        const fresh = new Set([...found].filter((value) => !known.has(value)));
        if (fresh.size === 0) continue;
        plan.set(child, new Set([...known, ...fresh]));
        queue.push([child, fresh]);
      }
    }
  }
  return plan;
}

/** The locale a user buys in: their record's locale in the seeded mix, or the first locale of their country. */
function buyerLocale(data: RequestData, user: Fields): CountryLocale {
  if (data.locale !== GLOBAL) return countryLocale(data.locale);
  const id = Number(user.id);
  if (Number.isInteger(id) && id >= 1 && id <= MAX_RECORDS)
    return globalLocales(data.seed, MAX_RECORDS)[id - 1] as CountryLocale;
  return (LOCALES.find((locale) => locale.country === user.country) ?? LOCALES[0]) as CountryLocale;
}

const SHIPPED = new Set(['shipped', 'delivered', 'refunded']);
const DELIVERED = new Set(['delivered', 'refunded']);

/**
 * An order as the server keeps it: each item's name and price read from `/products`, the totals and tax worked out
 * in the buyer's currency, and the dates set as the status moves on (`shippedAt` once it ships, `deliveredAt`
 * once it arrives). A `PATCH` that does not send `items` keeps the order's lines and prices as they were, the way a
 * shop keeps what was charged.
 */
export const deriveOrder: Derive = (sent, existing, data) => {
  const errors: Record<string, string> = {};
  const users = data.resource('users');
  const products = data.resource('products');
  const userId = sent.userId ?? existing?.userId;
  const userAt = data.indexOf(users, userId);
  if (userAt < 0) return { errors: { userId: `No user with id ${String(userId)}.` } };
  const buyer = buyerLocale(data, data.records(users)[userAt] as Fields);
  const decimals = buyer.priceScale >= 100 ? 0 : 2;
  const unit = 10 ** decimals;

  let money: Fields;
  if (Array.isArray(sent.items)) {
    const items = (sent.items as Fields[]).map((item, i) => {
      const at = data.indexOf(products, item.productId);
      const product = data.records(products)[at];
      if (!product) {
        errors[`items.${i}.productId`] = `No product with id ${String(item.productId)}.`;
        return null;
      }
      if (product.currency !== buyer.currency) {
        errors[`items.${i}.productId`] =
          `Product ${String(item.productId)} is priced in ${String(product.currency)}; this buyer pays in ${buyer.currency}.`;
        return null;
      }
      const quantity = Number(item.quantity);
      const price = Math.round(Number(product.price) * unit);
      return {
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice: price / unit,
        lineTotal: (price * quantity) / unit,
      };
    });
    if (Object.keys(errors).length > 0) return { errors };
    const lines = items as Array<{ quantity: number; lineTotal: number }>;
    const subtotal = lines.reduce((sum, line) => sum + Math.round(line.lineTotal * unit), 0);
    const tax = Math.round(subtotal * buyer.taxRate);
    money = {
      items: lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      currency: buyer.currency,
      subtotal: subtotal / unit,
      taxRate: buyer.taxRate,
      tax: tax / unit,
      total: (subtotal + tax) / unit,
    };
  } else {
    if (existing && existing.currency !== buyer.currency) {
      return {
        errors: {
          userId: `This order is in ${String(existing.currency)}; user ${String(userId)} pays in ${buyer.currency}.`,
        },
      };
    }
    const keep = ['items', 'itemCount', 'currency', 'subtotal', 'taxRate', 'tax', 'total'];
    money = Object.fromEntries(keep.map((key) => [key, existing?.[key]]));
  }

  const orderStatus = String(sent.orderStatus ?? existing?.orderStatus ?? 'pending');
  const now = new Date().toISOString();
  const shippedAt = SHIPPED.has(orderStatus)
    ? (existing?.shippedAt ?? now)
    : orderStatus === 'cancelled'
      ? (existing?.shippedAt ?? null)
      : null;
  const deliveredAt = DELIVERED.has(orderStatus) ? (existing?.deliveredAt ?? now) : null;
  return { record: { userId: Number(userId), orderStatus, ...money, shippedAt, deliveredAt } };
};
