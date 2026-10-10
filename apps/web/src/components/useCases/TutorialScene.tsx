import { useState } from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import { R } from '../../lib/useCases.ts';
import { isRecord, Stage, text, useScene, useWire, Wire } from './scene.tsx';

interface Step {
  title: string;
  status: number;
  fields: Array<[string, string]>;
}

/** The first characters of a long value, so a Latin paragraph stays one line. */
const clip = (value: string, max = 46) => (value.length > max ? `${value.slice(0, max).trimEnd()}…` : value);

function fieldsOf(body: unknown): Array<[string, string]> {
  if (!isRecord(body)) return [];
  return ['id', 'userId', 'title', 'body']
    .filter((key) => key in body)
    .map((key) => [key, clip(text(body[key]).replace(/\s+/g, ' '))]);
}

/** Use case 2: a JSONPlaceholder-shaped read, then a write that answers 201 with the new post. */
export function TutorialScene({ id, title }: { id: string; title: string }) {
  const { say } = useSpeaker();
  const { wire, pulse } = useWire();
  const [label, setLabel] = useState(`GET ${R.post.path}`);
  const [read, setRead] = useState<Step | null>(null);
  const [sent, setSent] = useState(false);
  const [written, setWritten] = useState<Step | null>(null);
  const [revealed, setRevealed] = useState(0);

  const scene = useScene(async (ctx) => {
    setRead(null);
    setSent(false);
    setWritten(null);
    setRevealed(0);
    setLabel(`GET ${R.post.path}`);
    pulse('idle');
    await ctx.wait(250);
    pulse('out');
    const got = await ctx.call(R.post);
    await ctx.wait(450);
    pulse('back');
    setRead({ title: `GET /posts/1`, status: got.status, fields: fieldsOf(got.json) });
    await ctx.wait(900);

    setLabel(`POST ${R.newPost.path}`);
    setSent(true);
    await ctx.wait(700);
    pulse('out');
    const made = await ctx.call(R.newPost);
    await ctx.wait(450);
    pulse('back');
    const fields = fieldsOf(made.json);
    setWritten({ title: `POST /posts`, status: made.status, fields });
    for (let i = 1; i <= fields.length; i += 1) {
      setRevealed(i);
      await ctx.wait(220);
    }
  });

  const body = JSON.stringify(R.newPost.body, null, 2);
  return (
    <Stage id={id} title={title} scene={scene}>
      <Wire label={label} phase={wire.phase} beat={wire.beat} />
      <div className="uc-exchange">
        {read && (
          <section className="uc-card-mini uc-in" aria-label={read.title} data-testid="uc-read">
            <header>
              <code>{read.title}</code>
              <span className={`uc-status ${read.status < 400 ? 'ok' : 'bad'}`}>{read.status}</span>
            </header>
            <dl className="uc-fields">
              {read.fields.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {sent && (
          <section className="uc-card-mini uc-in" aria-label={say('uc.tutorial-api.sent')}>
            <header>
              <code>POST /posts</code>
              {written ? (
                <span className={`uc-status ${written.status < 400 ? 'ok' : 'bad'}`} data-testid="uc-created-status">
                  {written.status}
                </span>
              ) : (
                <span className="uc-status wait">…</span>
              )}
            </header>
            <pre className="uc-mini-code">{body}</pre>
            {written && (
              <>
                <p className="uc-label">{say('uc.tutorial-api.answer')}</p>
                <dl className="uc-fields">
                  {written.fields.slice(0, revealed).map(([key, value]) => (
                    <div key={key} className={`uc-in ${key === 'id' ? 'uc-hot' : ''}`.trim()}>
                      <dt>{key}</dt>
                      <dd data-testid={key === 'id' ? 'uc-new-id' : undefined}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </section>
        )}
      </div>
    </Stage>
  );
}
