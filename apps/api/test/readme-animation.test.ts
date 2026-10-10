import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildHeroSvg, collectFacts, HERO_FILE } from '../../../scripts/readme-animation.ts';

// The animation at the top of the README is drawn from the API's own answers, so it cannot say what the API does not.
const committed = readFileSync(fileURLToPath(new URL(`../../../${HERO_FILE}`, import.meta.url)), 'utf8');

describe('the README animation', () => {
  it('is what the API draws today, so a change to the data means drawing it again', async () => {
    expect(committed).toBe(await buildHeroSvg());
  });

  it('is drawn from real answers: five seeded people, ten tries at fail=0.3, and a 503 with Retry-After', async () => {
    const facts = await collectFacts();
    expect(facts.people).toHaveLength(5);
    expect(facts.statuses).toHaveLength(10);
    expect(new Set(facts.statuses)).toEqual(new Set([200, 500]));
    expect(facts.down).toEqual({ status: 503, message: 'Service Unavailable', retryAfter: '1' });
    for (const person of facts.people) expect(committed).toContain(person.name);
    expect(committed).toContain(`${facts.statuses.filter((status) => status >= 400).length} of 10 failed`);
  });

  it('is the same on every run, even though fail=0.3 is random', async () => {
    expect((await collectFacts()).statuses).toEqual((await collectFacts()).statuses);
  });

  it('is small, loads nothing and runs nothing, so GitHub and npm will show it', () => {
    expect(Buffer.byteLength(committed)).toBeLessThan(60 * 1024);
    expect(committed).not.toMatch(/<script|<foreignObject|<image|href=|@import|url\(\s*['"]?https?:/i);
    expect(committed.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  });

  it('animates with CSS only, a few times, and stands still for a reader who asks for less motion', () => {
    expect(committed).toContain('@media (prefers-reduced-motion:no-preference)');
    expect(committed).not.toContain('infinite');
    // Every animation plays three times and then rests on its last frame.
    const animations = [...committed.matchAll(/animation:\S+ 14s \S+ (\S+) both/g)];
    expect(animations.length).toBeGreaterThan(20);
    for (const [, count] of animations) expect(count).toBe('3');
    // Anything that only exists to be animated is hidden outside the media query, so the still picture has none of it.
    expect(committed).toMatch(/\{opacity:0\}@media \(prefers-reduced-motion:no-preference\)/);
  });

  it('reads on its own before anything has played', () => {
    expect(committed).toContain('A repeatable fake backend for your frontend');
    expect(committed).toContain('curl');
    expect(committed).toContain('status=503');
  });
});
