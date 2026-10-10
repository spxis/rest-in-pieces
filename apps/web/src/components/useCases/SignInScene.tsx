import { useState } from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import { R } from '../../lib/useCases.ts';
import { isRecord, Stage, text, useScene, useWire, Wire } from './scene.tsx';

interface Line {
  request: string;
  status: number;
  note: string;
}

/** The three parts of a JWT, so the token reads as header.payload.signature and not as a smear. */
function Token({ value }: { value: string }) {
  const [head = '', payload = '', signature = ''] = value.split('.');
  const shorten = (part: string) => (part.length > 12 ? `${part.slice(0, 10)}…` : part);
  return (
    <code className="uc-token" data-testid="uc-token">
      <b className="h">{shorten(head)}</b>.<b className="p">{shorten(payload)}</b>.
      <b className="s">{shorten(signature)}</b>
    </code>
  );
}

/** Use case 5: sign in, use the token, watch it expire, refresh it. */
export function SignInScene({ id, title }: { id: string; title: string }) {
  const { say } = useSpeaker();
  const { wire, pulse } = useWire();
  const [label, setLabel] = useState(`POST ${R.login.path}`);
  const [token, setToken] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [ttl, setTtl] = useState(4);
  const [lines, setLines] = useState<Line[]>([]);

  const log = (request: string, status: number, note = '') => setLines((now) => [...now, { request, status, note }]);

  const scene = useScene(async (ctx) => {
    setToken(null);
    setRemaining(null);
    setLines([]);
    // Someone who asked for no motion gets a token that has already expired, so the 401 needs no waiting.
    const lifetime = ctx.reduced ? '0' : '4s';
    const login = { ...R.login, path: R.login.path.replace('4s', lifetime) };
    const refresh = { ...R.refresh, path: R.refresh.path.replace('4s', lifetime === '0' ? '30s' : lifetime) };

    setLabel(`POST ${login.path}`);
    pulse('out');
    const signedIn = await ctx.call(login);
    await ctx.wait(400);
    pulse('back');
    const body = isRecord(signedIn.json) ? signedIn.json : {};
    const access = text(body.accessToken);
    setToken(access);
    setTtl(Number(body.expiresIn) || 0);
    log('POST /auth/login', signedIn.status);
    const expiresAt = Date.parse(text(body.expiresAt));

    const protectedRoute = (bearer: string) => ({
      ...R.protectedRoute,
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const sendWithToken = async (bearer: string) => {
      setLabel(`GET ${R.protectedRoute.path}`);
      pulse('out');
      const reply = await ctx.call(protectedRoute(bearer));
      pulse(reply.ok ? 'back' : 'fail');
      const answer = isRecord(reply.json) ? text(reply.json.code) : '';
      log('GET /users?auth=admin', reply.status, answer);
      return reply;
    };

    if (!ctx.reduced) {
      await ctx.wait(500);
      await sendWithToken(access);
      for (;;) {
        const left = Math.max(0, (expiresAt - Date.now()) / 1000);
        setRemaining(left);
        if (left <= 0) break;
        await ctx.wait(250);
      }
      await ctx.wait(300);
    } else {
      setRemaining(0);
    }
    await sendWithToken(access);

    setLabel(`POST ${refresh.path}`);
    pulse('out');
    const renewed = await ctx.call({ ...refresh, body: { refreshToken: text(body.refreshToken) } });
    pulse('back');
    const fresh = isRecord(renewed.json) ? text(renewed.json.accessToken) : '';
    log('POST /auth/refresh', renewed.status);
    setToken(fresh);
    setTtl(Number(isRecord(renewed.json) ? renewed.json.expiresIn : 0) || 0);
    setRemaining(null);
    await ctx.wait(400);
    await sendWithToken(fresh);
  });

  const fraction = remaining === null || ttl === 0 ? 1 : Math.max(0, Math.min(1, remaining / ttl));
  return (
    <Stage id={id} title={title} scene={scene}>
      <Wire label={label} phase={wire.phase} beat={wire.beat} />
      <div className="uc-tokenbox">
        {token ? <Token value={token} /> : <code className="uc-token empty">{say('uc.sign-in.noToken')}</code>}
        <div
          className={`uc-meter ${remaining === 0 ? 'out' : ''}`}
          role="img"
          aria-label={
            remaining === null
              ? say('uc.sign-in.valid')
              : say('uc.sign-in.expiresIn', { seconds: Math.ceil(remaining) })
          }
        >
          <span className="uc-meter-bar" style={{ transform: `scaleX(${fraction})` }} />
        </div>
        <p className="uc-note" data-testid="uc-countdown">
          {remaining === null
            ? token
              ? say('uc.sign-in.valid')
              : ''
            : remaining > 0
              ? say('uc.sign-in.expiresIn', { seconds: Math.ceil(remaining) })
              : say('uc.sign-in.expired')}
        </p>
      </div>
      <ol className="uc-log" data-testid="uc-log">
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a log only ever appends
          <li key={index} className="uc-in" data-status={line.status}>
            <code>{line.request}</code>
            <span className={`uc-status ${line.status < 400 ? 'ok' : 'bad'}`}>{line.status}</span>
            {line.note && <small className="uc-log-note">{line.note}</small>}
          </li>
        ))}
      </ol>
    </Stage>
  );
}
