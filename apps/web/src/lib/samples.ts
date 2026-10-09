import type { HttpMethod } from './config.ts';

/** A body each writable dataset accepts as it stands, so a first POST or PUT succeeds. */
const RECORDS: Record<string, Record<string, unknown>> = {
  names: {
    name: 'Ada Lovelace',
    age: 36,
    address: '12 St. George St',
    city: 'Toronto',
    province: 'Ontario',
    postal: 'M5S 2E5',
    country: 'CA',
    gender: 'female',
  },
  users: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    avatar: 'https://example.com/ada.png',
    phone: '416-555-0100',
    jobTitle: 'Analyst',
    company: 'Analytical Engines',
    city: 'Toronto',
    country: 'CA',
    active: true,
  },
  products: {
    sku: 'AE-001',
    name: 'Difference Engine',
    department: 'Tools',
    description: 'Tabulates polynomials.',
    price: 1999.99,
    currency: 'CAD',
    rating: 4.5,
    stock: 3,
    inStock: true,
  },
  companies: {
    name: 'Analytical Engines',
    industry: 'Computing',
    catchPhrase: 'Weaving algebraic patterns',
    website: 'https://example.com',
    email: 'hello@example.com',
    phone: '416-555-0100',
    employees: 12,
    founded: 1843,
    city: 'Toronto',
    province: 'Ontario',
    country: 'CA',
  },
  // The server works out each item's name and price, the totals and the tax from these.
  orders: { userId: 3, items: [{ productId: 5, quantity: 2 }], orderStatus: 'paid' },
  posts: { userId: 1, title: 'On the analytical engine', body: 'It weaves algebraic patterns.' },
  comments: { postId: 1, userId: 3, name: 'Charles Babbage', email: 'charles@example.com', body: 'Splendid.' },
  todos: { userId: 1, title: 'Write the notes', completed: false, dueOn: '2026-02-01' },
  reviews: { productId: 1, userId: 3, rating: 5, title: 'Splendid', body: 'Tabulates beautifully.' },
};

/** A PATCH changes a field or two. */
const CHANGES: Record<string, Record<string, unknown>> = {
  names: { city: 'Halifax', province: 'Nova Scotia' },
  users: { email: 'ada@example.com', active: false },
  products: { price: 1499.99, stock: 0, inStock: false },
  companies: { employees: 40 },
  orders: { orderStatus: 'shipped' },
  posts: { title: 'On the engine, revised' },
  comments: { body: 'Splendid, truly.' },
  todos: { completed: true },
  reviews: { rating: 4 },
};

/** The starting body for a write to `endpoint`, pretty-printed; `''` for a method that sends none. */
export function sampleBody(endpoint: string, method: HttpMethod): string {
  if (method === 'GET' || method === 'DELETE') return '';
  const body = (method === 'PATCH' ? CHANGES : RECORDS)[endpoint] ?? {};
  return JSON.stringify(body, null, 2);
}

/** Whether a typed body parses as JSON. One that does not still sends, to rehearse the API's 400. */
export function isJson(body: string): boolean {
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}
