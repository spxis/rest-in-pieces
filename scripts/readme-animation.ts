/**
 * Draws the animation at the top of the README: `pnpm readme:animation` writes `docs/images/use-cases.svg`, and
 * `pnpm readme:animation --check` fails when the committed file is not what the API would draw today.
 *
 * Nothing in the picture is typed by hand. The people are what `GET /users?limit=5&seed=7&safe=true` answers, the ten
 * squares are ten real answers to `fail=0.3` (with the random number generator fixed, so the picture is the same on
 * every run), and the red banner is `status=503` with its `Retry-After`. All three go through `createApp().request()`,
 * the same app the server runs.
 *
 * The file is one SVG with CSS animation, which plays inside an `<img>` on GitHub and npm. With animation off, or with
 * `prefers-reduced-motion`, it shows the finished picture; at the first frame it already says what it is. It plays three
 * times and then rests on the finished picture, so it never runs for as long as a page stays open.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from '../apps/api/src/core.ts';

export const HERO_FILE = 'docs/images/use-cases.svg';

const REQUESTS = {
  people: '/users?limit=5&seed=7&safe=true',
  flaky: '/users?limit=1&seed=1&fail=0.3',
  down: '/users?limit=1&status=503',
} as const;
const TRIES = 10;
const CYCLE = 14;
const PLAYS = 3;

interface Person {
  name: string;
  email: string;
  city: string;
}

export interface Facts {
  people: Person[];
  statuses: number[];
  down: { status: number; message: string; retryAfter: string };
}

/** A fixed stream of numbers in [0, 1), so `fail=0.3` fails the same requests on every run. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Asks the real API for everything the picture shows. */
export async function collectFacts(): Promise<Facts> {
  const ask = createApp();
  const list = (await (await ask.request(REQUESTS.people)).json()) as { results: Array<Record<string, unknown>> };
  const people = list.results.map((user) => ({
    name: `${user.firstName} ${user.lastName}`,
    email: String(user.email),
    city: String(user.city),
  }));

  // The failure simulation draws from Math.random when the app is built, so the app that draws the ten answers is
  // built while the random number generator is the fixed one.
  const realRandom = Math.random;
  Math.random = mulberry32(2026);
  let flaky: ReturnType<typeof createApp>;
  try {
    flaky = createApp();
  } finally {
    Math.random = realRandom;
  }
  const statuses: number[] = [];
  for (let i = 0; i < TRIES; i += 1) statuses.push((await flaky.request(REQUESTS.flaky)).status);

  const outage = await ask.request(REQUESTS.down);
  const body = (await outage.json()) as { error: string };
  return {
    people,
    statuses,
    down: { status: outage.status, message: body.error, retryAfter: outage.headers.get('Retry-After') ?? '' },
  };
}

const xml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (seconds: number) => `${((seconds / CYCLE) * 100).toFixed(2)}%`;

/** CSS for the animations, collected as elements ask for them. */
class Motion {
  private rules: string[] = [];
  /** Things that exist only to be animated, so the finished picture has none of them. */
  private hidden: string[] = [];
  private count = 0;

  /** Visible from `at` seconds into each play, hidden before it. Returns the class to put on the element. */
  appear(at: number, rise = 6): string {
    const name = `a${this.count++}`;
    this.rules.push(
      `@keyframes ${name}{0%,${pct(at)}{opacity:0;transform:translateY(${rise}px)}${pct(at + 0.4)},100%{opacity:1;transform:none}}` +
        `.${name}{animation:${name} ${CYCLE}s linear ${PLAYS} both}`,
    );
    return name;
  }

  /** Visible from the start of each play until `until` seconds in, then gone. Its resting style is hidden. */
  placeholder(until: number): string {
    const name = `p${this.count++}`;
    this.rules.push(
      `@keyframes ${name}{0%,${pct(until)}{opacity:1}${pct(until + 0.3)},100%{opacity:0}}` +
        `.${name}{animation:${name} ${CYCLE}s linear ${PLAYS} both}`,
    );
    this.hidden.push(`.${name}`);
    return name;
  }

  /** A dot that travels `distance` pixels between `from` and `to` seconds, then disappears. */
  travel(from: number, to: number, distance: number): string {
    const name = `t${this.count++}`;
    this.rules.push(
      `@keyframes ${name}{0%,${pct(from)}{opacity:0;transform:translateX(0)}${pct(from + 0.05)}{opacity:1}` +
        `${pct(to)}{opacity:1;transform:translateX(${distance}px)}${pct(to + 0.05)},100%{opacity:0;transform:translateX(${distance}px)}}` +
        `.${name}{animation:${name} ${CYCLE}s ease-in-out ${PLAYS} both}`,
    );
    this.hidden.push(`.${name}`);
    return name;
  }

  css(): string {
    return `${this.hidden.join(',')}{opacity:0}@media (prefers-reduced-motion:no-preference){${this.rules.join('')}}`;
  }
}

const SANS = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

const hue = (text: string) => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 0);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** The finished picture as an SVG document, from what the API said. */
export function drawHero({ people, statuses, down }: Facts): string {
  const motion = new Motion();
  const parts: string[] = [];

  // What it is, before anything has played.
  parts.push(
    `<text x="28" y="40" fill="#c9f36a" font-family="${MONO}" font-size="14" font-weight="600">REST in Pieces</text>`,
    `<text x="28" y="76" fill="#f1f6f2" font-family="${SANS}" font-size="27" font-weight="700">A repeatable fake backend for your frontend</text>`,
    `<text x="28" y="102" fill="#9fb0a4" font-family="${SANS}" font-size="14">Same seed, same people on every machine. Slow, flaky or messy whenever you ask.</text>`,
  );

  const column = (x: number, number: number, title: string) =>
    `<rect x="${x}" y="126" width="260" height="288" rx="12" fill="#151d18" stroke="#2c372f"/>` +
    `<circle cx="${x + 22}" cy="152" r="10" fill="#183626"/>` +
    `<text x="${x + 22}" y="156" text-anchor="middle" fill="#c9f36a" font-family="${MONO}" font-size="11" font-weight="600">${number}</text>` +
    `<text x="${x + 40}" y="156" fill="#e3eae4" font-family="${SANS}" font-size="14" font-weight="600">${xml(title)}</text>`;

  // 1. The request.
  const ask = 28;
  parts.push(column(ask, 1, 'Ask for people'));
  const command = `curl 'localhost:6800${REQUESTS.people}'`;
  const wrapAt = command.indexOf('?');
  const lines = [command.slice(0, wrapAt), command.slice(wrapAt)];
  parts.push(
    `<rect x="${ask + 14}" y="176" width="232" height="82" rx="8" fill="#0b110d"/>`,
    ...lines.map(
      (line, i) =>
        `<text x="${ask + 26}" y="${202 + i * 20}" fill="#d9e6dc" font-family="${MONO}" font-size="12">${i === 0 ? '<tspan fill="#c9f36a">$ </tspan>' : '<tspan>  </tspan>'}${xml(line)}</text>`,
    ),
    `<text class="${motion.appear(2.0, 0)}" x="${ask + 26}" y="${202 + 2 * 20}" fill="#7f9387" font-family="${MONO}" font-size="11">GET → 200 OK</text>`,
    `<text x="${ask + 14}" y="288" fill="#9fb0a4" font-family="${MONO}" font-size="10.5">your app</text>`,
    `<text x="${ask + 246}" y="288" text-anchor="end" fill="#9fb0a4" font-family="${MONO}" font-size="10.5">REST in Pieces</text>`,
    `<line x1="${ask + 14}" y1="300" x2="${ask + 246}" y2="300" stroke="#2c372f" stroke-width="2" stroke-linecap="round"/>`,
    `<circle class="${motion.travel(0.9, 1.6, 218)}" cx="${ask + 20}" cy="300" r="5" fill="#c9f36a"/>`,
    `<circle class="${motion.travel(1.7, 2.4, -218)}" cx="${ask + 240}" cy="300" r="5" fill="#7fd39f"/>`,
    `<text x="${ask + 14}" y="338" fill="#9fb0a4" font-family="${SANS}" font-size="12.5">No server, no account, nothing to</text>`,
    `<text x="${ask + 14}" y="356" fill="#9fb0a4" font-family="${SANS}" font-size="12.5">write: records that agree with each</text>`,
    `<text x="${ask + 14}" y="374" fill="#9fb0a4" font-family="${SANS}" font-size="12.5">other, in fifteen countries.</text>`,
  );

  // 2. The people.
  const table = 310;
  parts.push(column(table, 2, 'Real-looking people'));
  const placeholder = motion.placeholder(2.4);
  for (const [i, person] of people.entries()) {
    const y = 174 + i * 46;
    const shown = motion.appear(2.6 + i * 0.28);
    parts.push(
      `<g class="${placeholder}"><circle cx="${table + 30}" cy="${y + 14}" r="14" fill="#223026"/><rect x="${table + 52}" y="${y + 4}" width="${120 - (i % 3) * 14}" height="9" rx="4.5" fill="#223026"/><rect x="${table + 52}" y="${y + 20}" width="${80 + (i % 2) * 20}" height="7" rx="3.5" fill="#1b251e"/></g>`,
      `<g class="${shown}">` +
        `<circle cx="${table + 30}" cy="${y + 14}" r="14" fill="hsl(${hue(person.name)} 38% 38%)"/>` +
        `<text x="${table + 30}" y="${y + 18}" text-anchor="middle" fill="#fff" font-family="${MONO}" font-size="10.5" font-weight="600">${xml(initials(person.name))}</text>` +
        `<text x="${table + 52}" y="${y + 12}" fill="#f1f6f2" font-family="${SANS}" font-size="13" font-weight="600">${xml(person.name)}</text>` +
        `<text x="${table + 52}" y="${y + 28}" fill="#8da096" font-family="${SANS}" font-size="11">${xml(person.email)}</text>` +
        `</g>`,
    );
  }

  // 3. The unhappy path.
  const drill = 592;
  parts.push(column(drill, 3, 'Break it on purpose'));
  const failed = statuses.filter((status) => status >= 400).length;
  parts.push(
    `<text x="${drill + 14}" y="186" fill="#9fb0a4" font-family="${MONO}" font-size="11">fail=0.3, ten requests</text>`,
  );
  for (const [i, status] of statuses.entries()) {
    const x = drill + 14 + (i % 5) * 47;
    const y = 198 + Math.floor(i / 5) * 40;
    const bad = status >= 400;
    parts.push(
      `<g class="${motion.appear(4.4 + i * 0.35, 4)}"><rect x="${x}" y="${y}" width="42" height="32" rx="7" fill="${bad ? '#3a1d17' : '#1d3325'}"/>` +
        `<text x="${x + 21}" y="${y + 21}" text-anchor="middle" fill="${bad ? '#ff9d86' : '#7fd39f'}" font-family="${MONO}" font-size="12" font-weight="600">${status}</text></g>`,
    );
  }
  parts.push(
    `<text class="${motion.appear(4.4 + TRIES * 0.35)}" x="${drill + 14}" y="288" fill="#c8d4cc" font-family="${SANS}" font-size="12.5">${failed} of ${TRIES} failed, at random</text>`,
    `<text x="${drill + 14}" y="314" fill="#9fb0a4" font-family="${MONO}" font-size="11">status=503</text>`,
    `<g class="${motion.appear(4.4 + TRIES * 0.35 + 0.9)}"><rect x="${drill + 14}" y="322" width="232" height="52" rx="8" fill="#3a1d17"/>` +
      `<text x="${drill + 28}" y="345" fill="#ff9d86" font-family="${SANS}" font-size="14" font-weight="700">${down.status} ${xml(down.message)}</text>` +
      `<text x="${drill + 28}" y="364" fill="#e8b4a8" font-family="${MONO}" font-size="11">Retry-After: ${xml(down.retryAfter)}</text></g>`,
  );

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 440" width="880" height="440" role="img" aria-labelledby="t d">`,
    `<title id="t">REST in Pieces: ask for seeded people, then break the backend on purpose</title>`,
    `<desc id="d">A request for five users with a fixed seed returns the same five people every time. Ten requests with fail=0.3 show ${failed} failures, and status=503 returns a 503 with Retry-After.</desc>`,
    `<style>${motion.css()}</style>`,
    `<rect x="0.5" y="0.5" width="879" height="439" rx="16" fill="#0f1612" stroke="#2c372f"/>`,
    ...parts,
    `<text x="852" y="432" text-anchor="end" fill="#5f7266" font-family="${SANS}" font-size="10.5">Every value is invented. Drawn from the API's own answers by scripts/readme-animation.ts.</text>`,
    `</svg>`,
    '',
  ].join('\n');
}

export async function buildHeroSvg(): Promise<string> {
  return drawHero(await collectFacts());
}

const run = process.argv[1] === fileURLToPath(import.meta.url);
if (run) {
  const root = new URL('../', import.meta.url);
  const target = new URL(HERO_FILE, root);
  const svg = await buildHeroSvg();
  if (process.argv.includes('--check')) {
    const kept = (() => {
      try {
        return readFileSync(target, 'utf8');
      } catch {
        return '';
      }
    })();
    if (kept !== svg) {
      console.error(`${HERO_FILE} is not what the API draws today. Run \`pnpm readme:animation\` and commit it.`);
      process.exit(1);
    }
    console.log(`${HERO_FILE} is up to date.`);
  } else {
    writeFileSync(target, svg);
    console.log(`Wrote ${HERO_FILE} (${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB)`);
  }
}
