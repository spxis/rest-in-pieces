/**
 * Makes a string that matches a regular expression, from a small subset of the syntax, without running one.
 *
 * Supported: literals and escaped characters, `.`, `\d` `\w` `\s`, classes (`[A-Z0-9_-]`, `[^…]`), groups (`(…)` and
 * `(?:…)`), alternation `|`, the quantifiers `? * + {n} {n,} {n,m}` (a trailing `?` is read and ignored), and `^` and `$`
 * at the two ends. Anything else (lookahead, backreferences, `\b`, named groups, flags) is refused with a message
 * saying so, because a value that does not match the pattern would be wrong data, not a harmless omission.
 *
 * It is a generator, not a matcher: nothing here executes the pattern as a `RegExp`, so no pattern can hang it. What a
 * pattern can ask for is capped: `PATTERN_LIMITS`.
 */

export const PATTERN_LIMITS = {
  /** Characters in the pattern. */
  source: 200,
  /** Nodes in its tree. */
  nodes: 200,
  /** Characters it may produce. */
  output: 256,
  /** The largest `{n}` or `{n,m}`. */
  repeat: 64,
  /** Repetitions `*`, `+` and `{n,}` add on top of their minimum. */
  open: 4,
  /** Nesting of groups. */
  depth: 8,
  /** Steps one string may take, so nested repeats that produce nothing cannot spin. */
  steps: 2000,
} as const;

/** A pattern the generator cannot read or that goes past a limit. */
export class PatternError extends Error {}

type Node =
  | { t: 'char'; set: string }
  | { t: 'seq'; items: Node[] }
  | { t: 'alt'; options: Node[] }
  | { t: 'rep'; item: Node; min: number; max: number };

const DIGITS = '0123456789';
const WORD = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
const ANY = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');

/** Letters and digits stand for themselves when escaped; these escapes mean something else. */
const CLASS_ESCAPES: Record<string, string> = { d: DIGITS, w: WORD, s: ' ' };
const CONTROL_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r' };

class Reader {
  private at = 0;
  private nodes = 0;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  private count(): void {
    if (++this.nodes > PATTERN_LIMITS.nodes) {
      throw new PatternError(`a pattern may have at most ${PATTERN_LIMITS.nodes} parts.`);
    }
  }

  private peek(): string | undefined {
    return this.source[this.at];
  }

  parse(): Node {
    if (this.source.length > PATTERN_LIMITS.source) {
      throw new PatternError(`a pattern may be at most ${PATTERN_LIMITS.source} characters long.`);
    }
    if (this.peek() === '^') this.at++;
    const tree = this.alternation(0);
    if (this.at < this.source.length) throw new PatternError(`unexpected "${this.peek()}" at position ${this.at + 1}.`);
    return tree;
  }

  private alternation(depth: number): Node {
    if (depth > PATTERN_LIMITS.depth) {
      throw new PatternError(`groups may be nested at most ${PATTERN_LIMITS.depth} deep.`);
    }
    const options: Node[] = [this.sequence(depth)];
    while (this.peek() === '|') {
      this.at++;
      options.push(this.sequence(depth));
    }
    this.count();
    return options.length === 1 ? (options[0] as Node) : { t: 'alt', options };
  }

  private sequence(depth: number): Node {
    const items: Node[] = [];
    for (let char = this.peek(); char !== undefined && char !== '|' && char !== ')'; char = this.peek()) {
      if (char === '$' && this.at === this.source.length - 1) {
        this.at++;
        break;
      }
      items.push(this.quantified(depth));
    }
    this.count();
    return { t: 'seq', items };
  }

  private quantified(depth: number): Node {
    const atom = this.atom(depth);
    const char = this.peek();
    let min = 1;
    let max = 1;
    if (char === '?') [min, max] = [0, 1];
    else if (char === '*') [min, max] = [0, PATTERN_LIMITS.open];
    else if (char === '+') [min, max] = [1, 1 + PATTERN_LIMITS.open];
    else if (char === '{') {
      const match = /^\{(\d+)(?:(,)(\d*))?\}/.exec(this.source.slice(this.at));
      if (!match) throw new PatternError(`a "{" at position ${this.at + 1} is not a repeat such as {3} or {2,5}.`);
      min = Number(match[1]);
      max = match[2] === undefined ? min : match[3] === '' ? min + PATTERN_LIMITS.open : Number(match[3]);
      if (max < min) throw new PatternError(`the repeat ${match[0]} counts down.`);
      if (max > PATTERN_LIMITS.repeat) {
        throw new PatternError(`a repeat may be at most ${PATTERN_LIMITS.repeat}; ${match[0]} is more.`);
      }
      this.at += match[0].length - 1;
    } else return atom;
    this.at++;
    // A trailing `?` makes a quantifier lazy, which changes nothing about what matches.
    if (this.peek() === '?') this.at++;
    this.count();
    return { t: 'rep', item: atom, min, max };
  }

  private atom(depth: number): Node {
    const char = this.peek();
    this.count();
    if (char === undefined) throw new PatternError('the pattern ends where a character was expected.');
    this.at++;
    if (char === '(') {
      if (this.peek() === '?') {
        if (this.source.startsWith('?:', this.at)) this.at += 2;
        else throw new PatternError('only plain and (?:…) groups are supported; lookahead and named groups are not.');
      }
      const inner = this.alternation(depth + 1);
      if (this.peek() !== ')') throw new PatternError('a group is never closed.');
      this.at++;
      return inner;
    }
    if (char === '[') return this.characterClass();
    if (char === '.') return { t: 'char', set: ANY };
    if (char === '\\') return this.escape(false);
    if ('*+?{}|)'.includes(char) || char === '^' || char === '$') {
      throw new PatternError(`"${char}" at position ${this.at} cannot be used here.`);
    }
    return { t: 'char', set: char };
  }

  private escape(inClass: boolean): Node {
    const char = this.peek();
    if (char === undefined) throw new PatternError('the pattern ends after a backslash.');
    this.at++;
    const set = CLASS_ESCAPES[char];
    if (set !== undefined) return { t: 'char', set };
    const control = CONTROL_ESCAPES[char];
    if (control !== undefined) return { t: 'char', set: control };
    if (/[DWSbB0-9AZzpPkux]/.test(char) && !(inClass && char === 'b')) {
      throw new PatternError(`the escape \\${char} is not supported.`);
    }
    return { t: 'char', set: char };
  }

  private characterClass(): Node {
    let negated = false;
    if (this.peek() === '^') {
      negated = true;
      this.at++;
    }
    let set = '';
    let first = true;
    for (;;) {
      const char = this.peek();
      if (char === undefined) throw new PatternError('a character class is never closed.');
      this.at++;
      if (char === ']' && !first) break;
      first = false;
      let from: string;
      if (char === '\\') {
        const escaped = this.escape(true);
        if (escaped.t !== 'char') continue;
        if (escaped.set.length !== 1) {
          set += escaped.set;
          continue;
        }
        from = escaped.set;
      } else from = char;
      if (this.peek() === '-' && this.source[this.at + 1] !== ']' && this.at + 1 < this.source.length) {
        this.at++;
        let to = this.peek() as string;
        this.at++;
        if (to === '\\') {
          const escaped = this.escape(true);
          if (escaped.t !== 'char' || escaped.set.length !== 1) throw new PatternError('a range ends in a class.');
          to = escaped.set;
        }
        const low = from.codePointAt(0) as number;
        const high = to.codePointAt(0) as number;
        if (high < low) throw new PatternError(`the range ${from}-${to} counts down.`);
        if (high - low > 255) throw new PatternError(`the range ${from}-${to} is too wide.`);
        for (let code = low; code <= high; code++) set += String.fromCodePoint(code);
      } else set += from;
      this.count();
    }
    if (negated) set = [...PRINTABLE].filter((char) => !set.includes(char)).join('');
    if (set === '') throw new PatternError('a character class matches nothing.');
    return { t: 'char', set };
  }
}

/** A pattern read and ready to produce strings. */
export interface CompiledPattern {
  /**
   * One string that matches, using `draw` for every choice: `draw(n)` is an integer from 0 to `n - 1`. `charge` is told
   * how many steps the string took, so a caller making many can hold them to a budget.
   */
  make(draw: (n: number) => number, charge?: (steps: number) => void): string;
}

/** Reads a pattern, or throws `PatternError` saying what it cannot do. */
export function compilePattern(source: string): CompiledPattern {
  const tree = new Reader(source).parse();
  return {
    make(draw, charge) {
      let out = '';
      let steps = 0;
      const walk = (node: Node): void => {
        if (++steps > PATTERN_LIMITS.steps) throw new PatternError('a pattern repeats too much to produce a string.');
        if (out.length > PATTERN_LIMITS.output) {
          throw new PatternError(`a pattern may produce at most ${PATTERN_LIMITS.output} characters.`);
        }
        switch (node.t) {
          case 'char':
            out += node.set[draw(node.set.length)];
            break;
          case 'seq':
            for (const item of node.items) walk(item);
            break;
          case 'alt':
            walk(node.options[draw(node.options.length)] as Node);
            break;
          case 'rep': {
            const times = node.min + draw(node.max - node.min + 1);
            for (let i = 0; i < times; i++) walk(node.item);
            break;
          }
        }
      };
      try {
        walk(tree);
      } finally {
        charge?.(steps);
      }
      if (out.length > PATTERN_LIMITS.output) {
        throw new PatternError(`a pattern may produce at most ${PATTERN_LIMITS.output} characters.`);
      }
      return out;
    },
  };
}
