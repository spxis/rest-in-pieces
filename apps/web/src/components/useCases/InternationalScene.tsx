import { useRef, useState } from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import { LOCALES, type LocaleChoice, R } from '../../lib/useCases.ts';
import { Avatar, resultsOf, Stage, text, useScene, useWire, Wire } from './scene.tsx';

type Rows = Array<Record<string, unknown>>;

const JAPANESE = /[぀-ヿ一-鿿]/u;
const langOf = (value: string) => (JAPANESE.test(value) ? 'ja' : undefined);

/** Use case 9: one seed, four audiences. The chips can also be pressed, to look at any of them. */
export function InternationalScene({ id, title }: { id: string; title: string }) {
  const { say } = useSpeaker();
  const { wire, pulse } = useWire();
  const [data, setData] = useState<Partial<Record<LocaleChoice, Rows>>>({});
  const [active, setActive] = useState<LocaleChoice>('en-CA');
  const picked = useRef(false);

  const scene = useScene(async (ctx) => {
    picked.current = false;
    setData({});
    setActive('en-CA');
    pulse('idle');
    await ctx.wait(200);
    for (const locale of LOCALES) {
      if (picked.current) return;
      pulse('out');
      const reply = await ctx.call(R.locale(locale));
      pulse('back');
      setData((now) => ({ ...now, [locale]: resultsOf(reply) }));
      setActive(locale);
      await ctx.wait(1500);
    }
  });

  const rows = data[active] ?? [];
  return (
    <Stage id={id} title={title} scene={scene}>
      <Wire label={`GET ${R.locale(active).path}`} phase={wire.phase} beat={wire.beat} />
      <fieldset className="uc-chips">
        <legend className="sr-only">{say('uc.international.locales')}</legend>
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            className={active === locale ? 'active' : ''}
            aria-pressed={active === locale}
            disabled={!data[locale]}
            data-testid={`uc-locale-${locale}`}
            onClick={() => {
              picked.current = true;
              setActive(locale);
            }}
          >
            {locale}
          </button>
        ))}
      </fieldset>
      <table className="uc-table" aria-label={say('uc.international.table', { locale: active })} data-locale={active}>
        <thead>
          <tr>
            <th scope="col">{say('uc.col.person')}</th>
            <th scope="col">{say('uc.col.city')}</th>
            <th scope="col">{say('uc.col.phone')}</th>
          </tr>
        </thead>
        <tbody key={active}>
          {rows.map((person) => {
            const name = `${text(person.firstName)} ${text(person.lastName)}`;
            return (
              <tr key={text(person.id)} className="uc-in" data-testid="uc-locale-row">
                <td>
                  <span className="uc-person">
                    <Avatar name={name} id={text(person.id)} />
                    <b lang={langOf(name)}>{name}</b>
                  </span>
                </td>
                <td lang={langOf(text(person.city))}>
                  {text(person.city)}
                  <small className="uc-sub">{text(person.country)}</small>
                </td>
                <td className="uc-num">{text(person.phone)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Stage>
  );
}
