import { useState } from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import { R } from '../../lib/useCases.ts';
import { resultsOf, Stage, text, useScene } from './scene.tsx';

type Rows = Array<Record<string, unknown>>;

const same = (a: Rows, b: Rows) => a.length > 0 && JSON.stringify(a) === JSON.stringify(b);

function Run({ label, rows, shown, tone }: { label: string; rows: Rows; shown: number; tone: 'a' | 'b' | 'c' }) {
  return (
    <section className={`uc-run ${tone}`} aria-label={label}>
      <h3>{label}</h3>
      <ol>
        {rows.slice(0, shown).map((row) => (
          <li key={text(row.index)} className="uc-in" data-testid={`uc-run-${tone}-row`}>
            <span className="uc-run-name">{text(row.name)}</span>
            <small className="uc-run-age">{text(row.age)}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Use case 6: the same seed twice gives the same people, another seed gives another set. */
export function RepeatableScene({ id, title }: { id: string; title: string }) {
  const { say } = useSpeaker();
  const [a, setA] = useState<Rows>([]);
  const [b, setB] = useState<Rows>([]);
  const [c, setC] = useState<Rows>([]);
  const [shown, setShown] = useState({ a: 0, b: 0, c: 0 });
  const [verdict, setVerdict] = useState<{ same: boolean; other: boolean } | null>(null);

  const scene = useScene(async (ctx) => {
    setA([]);
    setB([]);
    setC([]);
    setShown({ a: 0, b: 0, c: 0 });
    setVerdict(null);
    await ctx.wait(200);
    const first = resultsOf(await ctx.call(R.seedA));
    setA(first);
    for (let i = 1; i <= first.length; i += 1) {
      setShown((now) => ({ ...now, a: i }));
      await ctx.wait(120);
    }
    await ctx.wait(500);
    const second = resultsOf(await ctx.call(R.seedA));
    setB(second);
    for (let i = 1; i <= second.length; i += 1) {
      setShown((now) => ({ ...now, b: i }));
      await ctx.wait(120);
    }
    setVerdict({ same: same(first, second), other: false });
    await ctx.wait(1000);
    const third = resultsOf(await ctx.call(R.seedB));
    setC(third);
    for (let i = 1; i <= third.length; i += 1) {
      setShown((now) => ({ ...now, c: i }));
      await ctx.wait(120);
    }
    setVerdict({ same: same(first, second), other: !same(first, third) });
  });

  const seedOf = (path: string) => new URL(path, 'http://x').searchParams.get('seed') ?? '';
  return (
    <Stage id={id} title={title} scene={scene}>
      <div className="uc-runs">
        <Run label={say('uc.repeatable.monday', { seed: seedOf(R.seedA.path) })} rows={a} shown={shown.a} tone="a" />
        <Run label={say('uc.repeatable.friday', { seed: seedOf(R.seedA.path) })} rows={b} shown={shown.b} tone="b" />
      </div>
      {verdict && (
        <p className={`uc-verdict ${verdict.same ? 'ok' : 'bad'} uc-in`} data-testid="uc-same">
          {verdict.same ? say('uc.repeatable.identical') : say('uc.repeatable.differs')}
        </p>
      )}
      {c.length > 0 && (
        <>
          <Run label={say('uc.repeatable.other', { seed: seedOf(R.seedB.path) })} rows={c} shown={shown.c} tone="c" />
          {verdict?.other && (
            <p className="uc-verdict neutral uc-in" data-testid="uc-other">
              {say('uc.repeatable.another')}
            </p>
          )}
        </>
      )}
    </Stage>
  );
}
