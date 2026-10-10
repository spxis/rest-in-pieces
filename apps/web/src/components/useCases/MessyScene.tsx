import { useState } from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import type { PhraseKey } from '../../i18n/phrases.ts';
import { R } from '../../lib/useCases.ts';
import { Avatar, resultsOf, Stage, text, useScene } from './scene.tsx';

type Flag = 'missing' | 'blank' | 'long' | 'rtl' | 'emoji' | 'padded';

const FIELDS = ['name', 'email', 'phone', 'company', 'city'] as const;
type Field = (typeof FIELDS)[number];

const FLAG_PHRASES: Record<Flag, PhraseKey> = {
  missing: 'uc.messy-data.missing',
  blank: 'uc.messy-data.blank',
  long: 'uc.messy-data.long',
  rtl: 'uc.messy-data.rtl',
  emoji: 'uc.messy-data.emoji',
  padded: 'uc.messy-data.padded',
};

const RTL = /[֐-ࣿ]/u;
const EMOJI = /\p{Extended_Pictographic}/u;
const LONG = 60;

/** What a tidy layout would trip on in one value, read from the value itself. */
export function flagsOf(value: unknown): Flag[] {
  if (value === null || value === undefined) return ['missing'];
  const shown = text(value);
  if (shown.trim() === '') return ['blank'];
  const flags: Flag[] = [];
  if ([...shown].length > LONG) flags.push('long');
  if (RTL.test(shown)) flags.push('rtl');
  if (EMOJI.test(shown)) flags.push('emoji');
  if (shown !== shown.trim()) flags.push('padded');
  return flags;
}

function fieldValue(person: Record<string, unknown>, field: Field): unknown {
  if (field !== 'name') return person[field];
  if (!('firstName' in person) && !('lastName' in person)) return undefined;
  return `${text(person.firstName)} ${text(person.lastName)}`.trim();
}

type Rows = Array<Record<string, unknown>>;

/** Use case 4: the same four people, tidy and then messy, with what would break each card marked. */
export function MessyScene({ id, title }: { id: string; title: string }) {
  const { say } = useSpeaker();
  const [clean, setClean] = useState<Rows>([]);
  const [messy, setMessy] = useState<Rows>([]);
  const [view, setView] = useState<'clean' | 'messy'>('clean');
  const [marked, setMarked] = useState(false);

  const scene = useScene(async (ctx) => {
    setClean([]);
    setMessy([]);
    setView('clean');
    setMarked(false);
    const [tidy, rough] = await Promise.all([ctx.call(R.clean), ctx.call(R.messy)]);
    setClean(resultsOf(tidy));
    setMessy(resultsOf(rough));
    await ctx.wait(1400);
    setView('messy');
    await ctx.wait(900);
    setMarked(true);
  });

  const rows = view === 'clean' ? clean : messy;
  let broken = 0;
  const cards = rows.map((person) => {
    const cells = FIELDS.map((field) => ({
      field,
      value: fieldValue(person, field),
      flags: flagsOf(fieldValue(person, field)),
    }));
    broken += cells.filter((cell) => cell.flags.length > 0).length;
    return { person, cells };
  });

  return (
    <Stage id={id} title={title} scene={scene}>
      <p className="uc-switch">
        <span className={view === 'clean' ? 'uc-seg on' : 'uc-seg'}>{say('uc.messy-data.tidy')}</span>
        <span className={view === 'messy' ? 'uc-seg on' : 'uc-seg'}>{say('uc.messy-data.rough')}</span>
      </p>
      <ul className="uc-cards" data-view={view} data-marked={marked} data-testid="uc-messy-cards">
        {cards.map(({ person, cells }) => (
          <li key={`${view}-${text(person.id)}`} className="uc-device-card uc-in">
            <Avatar name={text(cells[0]?.value) || '?'} id={text(person.id)} />
            <div className="uc-card-fields">
              {cells.map(({ field, value, flags }) => (
                <p key={field} className={flags.length > 0 ? 'flagged' : ''} data-flagged={flags.length > 0}>
                  <span className="uc-value" dir="auto">
                    {value === null ? (
                      <i>null</i>
                    ) : value === undefined ? (
                      <i>—</i>
                    ) : text(value) === '' ? (
                      <i>""</i>
                    ) : (
                      text(value)
                    )}
                  </span>
                  {marked &&
                    flags.map((flag) => (
                      <em key={flag} className="uc-flag uc-in">
                        {say(FLAG_PHRASES[flag])}
                      </em>
                    ))}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {view === 'messy' && marked && (
        <p className="uc-note uc-in" data-testid="uc-broken">
          {say('uc.messy-data.count', { count: broken })}
        </p>
      )}
    </Stage>
  );
}
