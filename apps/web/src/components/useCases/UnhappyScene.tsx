import { useState } from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import { R } from '../../lib/useCases.ts';
import { isRecord, Stage, useScene, useWire, Wire } from './scene.tsx';

const FLAKY_TRIES = 10;

interface Slow {
  headersMs: number | null;
  pieces: string[];
  totalMs: number | null;
}

/** Use case 3: slow and in pieces, flaky, down and empty, each from a real request. */
export function UnhappyScene({ id, title }: { id: string; title: string }) {
  const { say } = useSpeaker();
  const { wire, pulse } = useWire();
  const [label, setLabel] = useState(`GET ${R.slow.path}`);
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState<Slow>({ headersMs: null, pieces: [], totalMs: null });
  const [tries, setTries] = useState<Array<number | null>>([]);
  const [down, setDown] = useState<{ status: number; message: string; retryAfter: string } | null>(null);
  const [empty, setEmpty] = useState<number | null>(null);

  const scene = useScene(async (ctx) => {
    setStep(0);
    setSlow({ headersMs: null, pieces: [], totalMs: null });
    setTries([]);
    setDown(null);
    setEmpty(null);
    pulse('idle');

    // Slow, and the body in pieces. Someone who asked for no motion gets the same body whole.
    setLabel(`GET ${R.slow.path}`);
    await ctx.wait(200);
    pulse('out');
    setStep(1);
    const request = ctx.reduced ? { path: R.slow.path.replace('&trickle=200', '') } : R.slow;
    const streamed = await ctx.stream(request, (piece, at) =>
      setSlow((now) => ({ ...now, headersMs: now.headersMs ?? at, pieces: [...now.pieces, piece] })),
    );
    pulse('back');
    setSlow((now) => ({ ...now, headersMs: streamed.headersMs, totalMs: streamed.totalMs }));
    await ctx.wait(500);

    // Flaky: ten requests, each one's own luck.
    setLabel(`GET ${R.flaky.path}`);
    setStep(2);
    if (ctx.reduced) {
      const all = await Promise.all(Array.from({ length: FLAKY_TRIES }, () => ctx.call(R.flaky)));
      setTries(all.map((reply) => reply.status));
    } else {
      for (let i = 0; i < FLAKY_TRIES; i += 1) {
        setTries((now) => [...now, null]);
        pulse('out');
        const reply = await ctx.call(R.flaky);
        pulse(reply.ok ? 'back' : 'fail');
        setTries((now) => now.map((value, index) => (index === i ? reply.status : value)));
        await ctx.wait(170);
      }
    }
    await ctx.wait(400);

    // Down, with the time to wait.
    setLabel(`GET ${R.down.path}`);
    setStep(3);
    pulse('out');
    const outage = await ctx.call(R.down);
    pulse('fail');
    const body = isRecord(outage.json) ? outage.json : {};
    setDown({
      status: outage.status,
      message: String(body.error ?? ''),
      retryAfter: outage.headers.get('Retry-After') ?? '',
    });
    await ctx.wait(600);

    // Empty: a search nothing matches.
    setLabel(`GET ${R.empty.path}`);
    setStep(4);
    pulse('out');
    const none = await ctx.call(R.empty);
    pulse('back');
    const results = isRecord(none.json) && Array.isArray(none.json.results) ? none.json.results : [];
    setEmpty(results.length);
  });

  const failed = tries.filter((status) => status !== null && status >= 400).length;
  const done = tries.filter((status) => status !== null).length;
  return (
    <Stage id={id} title={title} scene={scene} className="uc-states">
      <Wire label={label} phase={wire.phase} beat={wire.beat} />

      <section className={`uc-row ${step >= 1 ? 'on' : ''}`} aria-label={say('uc.unhappy-paths.slow')}>
        <h3>{say('uc.unhappy-paths.slow')}</h3>
        {slow.headersMs === null ? (
          step >= 1 && (
            <div className="uc-skeleton" aria-hidden="true">
              <span className="uc-skel" />
              <span className="uc-skel short" />
            </div>
          )
        ) : (
          <>
            <div className="uc-pieces" aria-hidden="true">
              {slow.pieces.map((piece, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: pieces only ever append, in order
                <i key={index} style={{ flexGrow: piece.length }} />
              ))}
            </div>
            <div className="uc-stream-frame">
              <pre className="uc-stream" data-testid="uc-stream">
                {slow.pieces.map((piece, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: pieces only ever append, in order
                  <span key={index} className={index % 2 ? 'odd' : 'even'}>
                    {piece}
                  </span>
                ))}
              </pre>
            </div>
          </>
        )}
        {slow.totalMs !== null && slow.headersMs !== null && (
          <p className="uc-note" data-testid="uc-timing">
            {say('uc.unhappy-paths.timing', { first: slow.headersMs, total: slow.totalMs, pieces: slow.pieces.length })}
          </p>
        )}
      </section>

      <section className={`uc-row ${step >= 2 ? 'on' : ''}`} aria-label={say('uc.unhappy-paths.flaky')}>
        <h3>{say('uc.unhappy-paths.flaky')}</h3>
        <ol className="uc-dots" data-testid="uc-dots">
          {tries.map((status, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: one dot per request, in the order they were sent
              key={index}
              className={status === null ? 'wait' : status < 400 ? 'ok' : 'bad'}
              data-status={status ?? ''}
            >
              {status ?? '…'}
            </li>
          ))}
        </ol>
        {done === FLAKY_TRIES && (
          <p className="uc-note" data-testid="uc-tally">
            {say('uc.unhappy-paths.tally', { failed, total: FLAKY_TRIES })}
          </p>
        )}
      </section>

      <section className={`uc-row ${step >= 3 ? 'on' : ''}`} aria-label={say('uc.unhappy-paths.down')}>
        <h3>{say('uc.unhappy-paths.down')}</h3>
        {down && (
          <div className="uc-banner bad uc-in" data-testid="uc-down">
            <b>{down.status}</b> {down.message}
            {down.retryAfter && <code>Retry-After: {down.retryAfter}</code>}
          </div>
        )}
      </section>

      <section className={`uc-row ${step >= 4 ? 'on' : ''}`} aria-label={say('uc.unhappy-paths.empty')}>
        <h3>{say('uc.unhappy-paths.empty')}</h3>
        {empty !== null && (
          <div className="uc-empty uc-in" data-testid="uc-empty">
            {say('uc.unhappy-paths.noResults', { count: empty })}
          </div>
        )}
      </section>
    </Stage>
  );
}
