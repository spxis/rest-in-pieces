/**
 * A tiny expression language for derived fields: `age(birth)`, `concat(first, ' ', last)`, `price * qty`.
 *
 * It is hand-written and has no way to reach anything outside the record it is given: no `eval`, no `Function`,
 * no `vm`, no property access, no loops, no assignment, no user-defined functions. An expression is read once into a
 * small tree, checked against fixed limits, and walked once per record. Every limit is a fixed number, so the
 * work a request can ask for is bounded before anything runs.
 *
 * Values are numbers, strings, booleans, `null` and dates. A step that cannot be worked out (a division by zero, a
 * number added to a date, an unreadable date) gives `null` rather than failing the request, the way a generator
 * with no data for a locale does.
 */

/** The limits every expression is held to. They only ever come down for a published reason. */
export const EXPRESSION_LIMITS = {
  /** Characters in one expression. */
  source: 400,
  /** Tokens in one expression. */
  tokens: 150,
  /** Nesting of brackets, calls and conditions. */
  depth: 12,
  /** Nodes in one expression's tree, and so the most steps it can take on one record. */
  nodes: 100,
  /** Characters in a string an expression builds. */
  text: 1000,
  /** Derived fields in one schema. */
  derived: 10,
} as const;

/** An expression the API cannot read, or that goes past a limit. Answered with `400`. */
export class ExpressionError extends Error {}

export type Value = number | string | boolean | null | Date;

type Node =
  | { t: 'lit'; v: number | string | boolean | null }
  | { t: 'id'; name: string }
  | { t: 'un'; op: '-' | '!'; a: Node }
  | { t: 'bin'; op: BinaryOp; a: Node; b: Node }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'cond'; c: Node; a: Node; b: Node };

type BinaryOp = '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||';

interface Token {
  kind: 'num' | 'str' | 'id' | 'op' | 'end';
  text: string;
  value?: number | string;
  at: number;
}

const OPERATORS = ['<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '(', ')', ','];

function tokenize(source: string): Token[] {
  if (source.length > EXPRESSION_LIMITS.source) {
    throw new ExpressionError(`an expression may be at most ${EXPRESSION_LIMITS.source} characters long.`);
  }
  const tokens: Token[] = [];
  let at = 0;
  while (at < source.length) {
    const char = source[at] as string;
    if (/\s/.test(char)) {
      at++;
      continue;
    }
    if (tokens.length >= EXPRESSION_LIMITS.tokens) {
      throw new ExpressionError(`an expression may have at most ${EXPRESSION_LIMITS.tokens} tokens.`);
    }
    const number = /^\d+(?:\.\d+)?/.exec(source.slice(at));
    if (number) {
      tokens.push({ kind: 'num', text: number[0], value: Number(number[0]), at });
      at += number[0].length;
      continue;
    }
    if (char === "'" || char === '"') {
      let text = '';
      let end = at + 1;
      while (end < source.length && source[end] !== char) {
        if (source[end] === '\\' && end + 1 < source.length) end++;
        text += source[end];
        end++;
      }
      if (end >= source.length) throw new ExpressionError(`the text starting at position ${at + 1} is never closed.`);
      tokens.push({ kind: 'str', text: source.slice(at, end + 1), value: text, at });
      at = end + 1;
      continue;
    }
    const word = /^[A-Za-z_]\w*/.exec(source.slice(at));
    if (word) {
      tokens.push({ kind: 'id', text: word[0], at });
      at += word[0].length;
      continue;
    }
    const op = OPERATORS.find((candidate) => source.startsWith(candidate, at));
    if (op) {
      tokens.push({ kind: 'op', text: op, at });
      at += op.length;
      continue;
    }
    if (char === '=') {
      throw new ExpressionError(`a single "=" at position ${at + 1} is not an operator; write "==" to compare.`);
    }
    throw new ExpressionError(`unexpected "${char}" at position ${at + 1}.`);
  }
  tokens.push({ kind: 'end', text: 'the end', at: source.length });
  return tokens;
}

/** Binding power of each binary operator; higher binds tighter. */
const BINDING: Record<BinaryOp, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

class Parser {
  private at = 0;
  private nodes = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private get token(): Token {
    return this.tokens[this.at] as Token;
  }

  private count(): void {
    if (++this.nodes > EXPRESSION_LIMITS.nodes) {
      throw new ExpressionError(`an expression may have at most ${EXPRESSION_LIMITS.nodes} parts.`);
    }
  }

  private is(text: string): boolean {
    return this.token.kind === 'op' && this.token.text === text;
  }

  private expect(text: string): void {
    if (!this.is(text)) throw new ExpressionError(`expected "${text}" but found ${this.describe()}.`);
    this.at++;
  }

  private describe(): string {
    return this.token.kind === 'end' ? 'the end' : `"${this.token.text}" at position ${this.token.at + 1}`;
  }

  parse(): { tree: Node; nodes: number } {
    const tree = this.expression(0);
    if (this.token.kind !== 'end') throw new ExpressionError(`unexpected ${this.describe()}.`);
    return { tree, nodes: this.nodes };
  }

  private expression(depth: number): Node {
    if (depth > EXPRESSION_LIMITS.depth) {
      throw new ExpressionError(`an expression may be nested at most ${EXPRESSION_LIMITS.depth} deep.`);
    }
    const test = this.binary(0, depth);
    if (!this.is('?')) return test;
    this.at++;
    this.count();
    const a = this.expression(depth + 1);
    this.expect(':');
    const b = this.expression(depth + 1);
    return { t: 'cond', c: test, a, b };
  }

  private binary(floor: number, depth: number): Node {
    let left = this.unary(depth);
    for (;;) {
      const op = this.token.kind === 'op' ? (this.token.text as BinaryOp) : undefined;
      const power = op === undefined ? undefined : BINDING[op];
      if (op === undefined || power === undefined || power <= floor) return left;
      this.at++;
      this.count();
      const right = this.binary(power, depth);
      left = { t: 'bin', op, a: left, b: right };
    }
  }

  private unary(depth: number): Node {
    if (this.is('-') || this.is('!')) {
      const op = this.token.text as '-' | '!';
      this.at++;
      this.count();
      if (depth + 1 > EXPRESSION_LIMITS.depth) {
        throw new ExpressionError(`an expression may be nested at most ${EXPRESSION_LIMITS.depth} deep.`);
      }
      return { t: 'un', op, a: this.unary(depth + 1) };
    }
    return this.primary(depth);
  }

  private primary(depth: number): Node {
    const token = this.token;
    this.count();
    if (token.kind === 'num' || token.kind === 'str') {
      this.at++;
      return { t: 'lit', v: token.value as number | string };
    }
    if (token.kind === 'id') {
      this.at++;
      if (this.is('(')) {
        this.at++;
        const args: Node[] = [];
        if (!this.is(')')) {
          for (;;) {
            args.push(this.expression(depth + 1));
            if (this.is(',')) {
              this.at++;
              continue;
            }
            break;
          }
        }
        this.expect(')');
        return { t: 'call', name: token.text, args };
      }
      if (token.text === 'true') return { t: 'lit', v: true };
      if (token.text === 'false') return { t: 'lit', v: false };
      if (token.text === 'null') return { t: 'lit', v: null };
      return { t: 'id', name: token.text };
    }
    if (this.is('(')) {
      this.at++;
      const inner = this.expression(depth + 1);
      this.expect(')');
      return inner;
    }
    throw new ExpressionError(`expected a value but found ${this.describe()}.`);
  }
}

// ---- values -------------------------------------------------------------------------------------------------

const isNumber = (value: Value): value is number => typeof value === 'number' && Number.isFinite(value);
const isDate = (value: Value): value is Date => value instanceof Date && !Number.isNaN(value.getTime());

const finite = (value: number): number | null => (Number.isFinite(value) ? value : null);

const truthy = (value: Value): boolean => value !== null && value !== false && value !== 0 && value !== '';

function text(value: Value): string | null {
  if (value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return String(value);
}

const limited = (value: string): string | null => (value.length > EXPRESSION_LIMITS.text ? null : value);

function compare(a: Value, b: Value): number | null {
  if (isNumber(a) && isNumber(b)) return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (isDate(a) && isDate(b)) return a.getTime() - b.getTime();
  return null;
}

function equal(a: Value, b: Value): boolean {
  if (a === null || b === null) return a === b;
  if (a instanceof Date || b instanceof Date) return compare(a, b) === 0;
  return a === b;
}

const DAY = 86_400_000;

/** Whole years from `from` to `to` by calendar, as someone counts a birthday. Negative when `to` is first. */
function wholeYears(from: Date, to: Date): number {
  if (to < from) return -wholeYears(to, from);
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const before =
    to.getUTCMonth() < from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate());
  if (before) years--;
  return years;
}

function wholeMonths(from: Date, to: Date): number {
  if (to < from) return -wholeMonths(to, from);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) months--;
  return months;
}

function addMonths(date: Date, months: number): Date | null {
  if (!Number.isInteger(months) || Math.abs(months) > 12_000) return null;
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return Number.isNaN(result.getTime()) ? null : result;
}

function addMilliseconds(date: Date, amount: number, unit: number): Date | null {
  if (!isNumber(amount) || Math.abs(amount * unit) > 400 * 365 * DAY) return null;
  const result = new Date(date.getTime() + amount * unit);
  return Number.isNaN(result.getTime()) ? null : result;
}

function readDate(value: Value): Date | null {
  if (isDate(value)) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Midnight at the start of today, UTC: the moment `today()` gives and generated dates are measured from. */
export const startOfToday = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

interface FunctionSpec {
  min: number;
  max: number;
  /** What it does, for `GET /generators`. */
  signature: string;
  run(args: Value[]): Value;
}

const numbers = (args: Value[]): number[] | null => (args.every(isNumber) ? (args as number[]) : null);

const rounded = (value: number, places: number): number | null => {
  if (!Number.isInteger(places) || places < 0 || places > 10) return null;
  const factor = 10 ** places;
  return finite(Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor);
};

/** Every function an expression may call. Nothing else is reachable. */
const FUNCTIONS: Record<string, FunctionSpec> = {
  abs: { min: 1, max: 1, signature: 'abs(x)', run: ([x]) => (isNumber(x as Value) ? Math.abs(x as number) : null) },
  round: {
    min: 1,
    max: 2,
    signature: 'round(x, places?)',
    run: ([x, places]) =>
      isNumber(x as Value) ? rounded(x as number, places === undefined ? 0 : (places as number)) : null,
  },
  floor: {
    min: 1,
    max: 1,
    signature: 'floor(x)',
    run: ([x]) => (isNumber(x as Value) ? Math.floor(x as number) : null),
  },
  ceil: { min: 1, max: 1, signature: 'ceil(x)', run: ([x]) => (isNumber(x as Value) ? Math.ceil(x as number) : null) },
  sqrt: {
    min: 1,
    max: 1,
    signature: 'sqrt(x)',
    run: ([x]) => (isNumber(x as Value) && (x as number) >= 0 ? Math.sqrt(x as number) : null),
  },
  pow: {
    min: 2,
    max: 2,
    signature: 'pow(base, exponent)',
    run: (args) => {
      const n = numbers(args);
      return n ? finite((n[0] as number) ** (n[1] as number)) : null;
    },
  },
  min: {
    min: 1,
    max: 10,
    signature: 'min(a, b, …)',
    run: (args) => {
      const n = numbers(args);
      return n ? Math.min(...n) : null;
    },
  },
  max: {
    min: 1,
    max: 10,
    signature: 'max(a, b, …)',
    run: (args) => {
      const n = numbers(args);
      return n ? Math.max(...n) : null;
    },
  },
  clamp: {
    min: 3,
    max: 3,
    signature: 'clamp(x, low, high)',
    run: (args) => {
      const n = numbers(args);
      return n && (n[1] as number) <= (n[2] as number)
        ? Math.min(Math.max(n[0] as number, n[1] as number), n[2] as number)
        : null;
    },
  },
  concat: {
    min: 1,
    max: 10,
    signature: 'concat(a, b, …)',
    run: (args) => limited(args.map((arg) => text(arg) ?? '').join('')),
  },
  lower: { min: 1, max: 1, signature: 'lower(text)', run: ([x]) => text(x as Value)?.toLowerCase() ?? null },
  upper: { min: 1, max: 1, signature: 'upper(text)', run: ([x]) => text(x as Value)?.toUpperCase() ?? null },
  trim: { min: 1, max: 1, signature: 'trim(text)', run: ([x]) => text(x as Value)?.trim() ?? null },
  len: { min: 1, max: 1, signature: 'len(text)', run: ([x]) => text(x as Value)?.length ?? null },
  substr: {
    min: 2,
    max: 3,
    signature: 'substr(text, start, length?)',
    run: ([x, start, length]) => {
      const s = text(x as Value);
      if (s === null || !isNumber(start as Value) || (length !== undefined && !isNumber(length))) return null;
      const from = Math.max(0, Math.trunc(start as number));
      return length === undefined ? s.slice(from) : s.slice(from, from + Math.max(0, Math.trunc(length as number)));
    },
  },
  slug: {
    min: 1,
    max: 1,
    signature: 'slug(text)',
    run: ([x]) =>
      text(x as Value)
        ?.normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') ?? null,
  },
  pad: {
    min: 2,
    max: 2,
    signature: 'pad(number, width)',
    run: ([x, width]) =>
      isNumber(x as Value) && Number.isInteger(width) && (width as number) >= 1 && (width as number) <= 20
        ? String(Math.trunc(x as number)).padStart(width as number, '0')
        : null,
  },
  coalesce: {
    min: 1,
    max: 10,
    signature: 'coalesce(a, b, …)',
    run: (args) => args.find((arg) => arg !== null) ?? null,
  },
  isNull: { min: 1, max: 1, signature: 'isNull(x)', run: ([x]) => x === null },
  today: { min: 0, max: 0, signature: 'today()', run: () => startOfToday() },
  date: { min: 1, max: 1, signature: "date('2026-01-31')", run: ([x]) => readDate(x as Value) },
  year: {
    min: 1,
    max: 1,
    signature: 'year(date)',
    run: ([d]) => (isDate(d as Value) ? (d as Date).getUTCFullYear() : null),
  },
  month: {
    min: 1,
    max: 1,
    signature: 'month(date)',
    run: ([d]) => (isDate(d as Value) ? (d as Date).getUTCMonth() + 1 : null),
  },
  day: { min: 1, max: 1, signature: 'day(date)', run: ([d]) => (isDate(d as Value) ? (d as Date).getUTCDate() : null) },
  dateOnly: {
    min: 1,
    max: 1,
    signature: 'dateOnly(date)',
    run: ([d]) => (isDate(d as Value) ? (d as Date).toISOString().slice(0, 10) : null),
  },
  age: {
    min: 1,
    max: 2,
    signature: 'age(birthDate, asOf?)',
    run: ([birth, asOf]) => {
      const from = readDate(birth as Value);
      const to = asOf === undefined ? startOfToday() : readDate(asOf);
      if (!from || !to) return null;
      const years = wholeYears(from, to);
      return years < 0 ? null : years;
    },
  },
  years: {
    min: 2,
    max: 2,
    signature: 'years(from, to)',
    run: ([a, b]) => {
      const from = readDate(a as Value);
      const to = readDate(b as Value);
      return from && to ? wholeYears(from, to) : null;
    },
  },
  months: {
    min: 2,
    max: 2,
    signature: 'months(from, to)',
    run: ([a, b]) => {
      const from = readDate(a as Value);
      const to = readDate(b as Value);
      return from && to ? wholeMonths(from, to) : null;
    },
  },
  days: {
    min: 2,
    max: 2,
    signature: 'days(from, to)',
    run: ([a, b]) => {
      const from = readDate(a as Value);
      const to = readDate(b as Value);
      return from && to ? Math.trunc((to.getTime() - from.getTime()) / DAY) : null;
    },
  },
  hours: {
    min: 2,
    max: 2,
    signature: 'hours(from, to)',
    run: ([a, b]) => {
      const from = readDate(a as Value);
      const to = readDate(b as Value);
      return from && to ? Math.trunc((to.getTime() - from.getTime()) / 3_600_000) : null;
    },
  },
  addDays: {
    min: 2,
    max: 2,
    signature: 'addDays(date, n)',
    run: ([d, n]) => {
      const date = readDate(d as Value);
      return date && isNumber(n as Value) ? addMilliseconds(date, n as number, DAY) : null;
    },
  },
  addHours: {
    min: 2,
    max: 2,
    signature: 'addHours(date, n)',
    run: ([d, n]) => {
      const date = readDate(d as Value);
      return date && isNumber(n as Value) ? addMilliseconds(date, n as number, 3_600_000) : null;
    },
  },
  addMinutes: {
    min: 2,
    max: 2,
    signature: 'addMinutes(date, n)',
    run: ([d, n]) => {
      const date = readDate(d as Value);
      return date && isNumber(n as Value) ? addMilliseconds(date, n as number, 60_000) : null;
    },
  },
  addMonths: {
    min: 2,
    max: 2,
    signature: 'addMonths(date, n)',
    run: ([d, n]) => {
      const date = readDate(d as Value);
      return date && isNumber(n as Value) ? addMonths(date, n as number) : null;
    },
  },
  addYears: {
    min: 2,
    max: 2,
    signature: 'addYears(date, n)',
    run: ([d, n]) => {
      const date = readDate(d as Value);
      return date && isNumber(n as Value) && Number.isInteger(n) ? addMonths(date, (n as number) * 12) : null;
    },
  },
};

/** The functions an expression may call, with their arguments, for `GET /generators` and the docs. */
export const EXPRESSION_FUNCTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(FUNCTIONS).map(([name, spec]) => [name, spec.signature]),
);

/** The names an expression reads as values, not as fields. */
const KEYWORDS = new Set(['true', 'false', 'null']);

// ---- compiling and running ----------------------------------------------------------------------------------

export interface CompiledExpression {
  /** The fields it reads, each once. */
  deps: string[];
  /** Works the expression out for one record. Never throws, and never takes more steps than `EXPRESSION_LIMITS.nodes`. */
  run(values: Readonly<Record<string, unknown>>): Value;
}

function collect(node: Node, deps: Set<string>): void {
  switch (node.t) {
    case 'id':
      deps.add(node.name);
      break;
    case 'un':
      collect(node.a, deps);
      break;
    case 'bin':
      collect(node.a, deps);
      collect(node.b, deps);
      break;
    case 'call':
      for (const arg of node.args) collect(arg, deps);
      break;
    case 'cond':
      collect(node.c, deps);
      collect(node.a, deps);
      collect(node.b, deps);
      break;
    default:
      break;
  }
}

function check(node: Node): void {
  if (node.t === 'call') {
    const spec = Object.hasOwn(FUNCTIONS, node.name) ? FUNCTIONS[node.name] : undefined;
    if (!spec) {
      throw new ExpressionError(`"${node.name}" is not a function. These are: ${Object.keys(FUNCTIONS).join(', ')}.`);
    }
    if (node.args.length < spec.min || node.args.length > spec.max) {
      throw new ExpressionError(
        `${node.name} takes ${spec.min === spec.max ? spec.min : `${spec.min} to ${spec.max}`} argument${spec.max === 1 ? '' : 's'}: ${spec.signature}.`,
      );
    }
    for (const arg of node.args) check(arg);
  } else if (node.t === 'un') check(node.a);
  else if (node.t === 'bin') {
    check(node.a);
    check(node.b);
  } else if (node.t === 'cond') {
    check(node.c);
    check(node.a);
    check(node.b);
  }
}

function binary(op: BinaryOp, a: Value, b: Value): Value {
  switch (op) {
    case '+':
      if (isNumber(a) && isNumber(b)) return finite(a + b);
      if ((typeof a === 'string' || typeof b === 'string') && a !== null && b !== null) {
        const left = text(a);
        const right = text(b);
        return left === null || right === null ? null : limited(left + right);
      }
      return null;
    case '-':
      return isNumber(a) && isNumber(b) ? finite(a - b) : null;
    case '*':
      return isNumber(a) && isNumber(b) ? finite(a * b) : null;
    case '/':
      return isNumber(a) && isNumber(b) && b !== 0 ? finite(a / b) : null;
    case '%':
      return isNumber(a) && isNumber(b) && b !== 0 ? finite(a % b) : null;
    case '==':
      return equal(a, b);
    case '!=':
      return !equal(a, b);
    default: {
      const order = compare(a, b);
      if (order === null) return null;
      if (op === '<') return order < 0;
      if (op === '<=') return order <= 0;
      if (op === '>') return order > 0;
      return order >= 0;
    }
  }
}

/** A value from a record, made one an expression handles: numbers, strings, booleans, null and dates only. */
function fromRecord(value: unknown): Value {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return Number(value);
  return null;
}

/**
 * Reads an expression. `fields` is every name it may read; any other name, any function that is not on the list and a
 * call with the wrong number of arguments are refused here, before a record is made. Throws `ExpressionError`.
 */
export function compileExpression(source: string, fields: ReadonlySet<string>): CompiledExpression {
  const { tree } = new Parser(tokenize(source)).parse();
  check(tree);
  const deps = new Set<string>();
  collect(tree, deps);
  for (const name of deps) {
    if (!KEYWORDS.has(name) && !fields.has(name)) {
      throw new ExpressionError(
        `"${name}" is not a field of this schema. Fields an expression can read: ${[...fields].join(', ') || 'none'}.`,
      );
    }
  }
  const run = (values: Readonly<Record<string, unknown>>): Value => {
    let steps = 0;
    const step = () => {
      if (++steps > EXPRESSION_LIMITS.nodes) throw new ExpressionError('an expression went past its step limit.');
    };
    const walk = (node: Node): Value => {
      step();
      switch (node.t) {
        case 'lit':
          return node.v;
        case 'id':
          return fromRecord(values[node.name]);
        case 'un': {
          const inner = walk(node.a);
          if (node.op === '!') return !truthy(inner);
          return isNumber(inner) ? -inner : null;
        }
        case 'bin': {
          if (node.op === '&&') {
            const left = walk(node.a);
            return truthy(left) ? truthy(walk(node.b)) : false;
          }
          if (node.op === '||') {
            const left = walk(node.a);
            return truthy(left) ? true : truthy(walk(node.b));
          }
          return binary(node.op, walk(node.a), walk(node.b));
        }
        case 'cond':
          return truthy(walk(node.c)) ? walk(node.a) : walk(node.b);
        case 'call':
          return (FUNCTIONS[node.name] as FunctionSpec).run(node.args.map(walk));
      }
    };
    return walk(tree);
  };
  return { deps: [...deps].filter((name) => !KEYWORDS.has(name)), run };
}
