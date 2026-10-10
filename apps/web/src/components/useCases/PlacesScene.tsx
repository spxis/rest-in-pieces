import { useState } from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import { R } from '../../lib/useCases.ts';
import { resultsOf, Stage, text, useScene, useWire, Wire } from './scene.tsx';

type Record_ = Record<string, unknown>;

/** What a picker keeps of a country: its flag emoji, its name in both languages and its code. */
const labelOf = (country: Record_) => `${text(country.emoji)} ${text(country.name)}`.trim();

/** A number with thousands separators, in the page's language. */
const figure = (value: unknown) => (typeof value === 'number' ? value.toLocaleString() : '—');

/**
 * Use case 11: a country select that fills a region select, and the place they name with its flag and capital. Three
 * real requests: the G7 as countries, Canada's provinces, and Ontario. Nothing here is typed in; every option, name and
 * figure came back from the API.
 */
export function PlacesScene({ id, title }: { id: string; title: string }) {
  const { say } = useSpeaker();
  const { wire, pulse } = useWire();
  const [countries, setCountries] = useState<Record_[]>([]);
  const [country, setCountry] = useState('');
  const [regions, setRegions] = useState<Record_[]>([]);
  const [region, setRegion] = useState('');
  const [place, setPlace] = useState<Record_ | null>(null);
  const [path, setPath] = useState<string>(R.g7.path);

  const scene = useScene(async (ctx) => {
    setCountries([]);
    setCountry('');
    setRegions([]);
    setRegion('');
    setPlace(null);
    setPath(R.g7.path);
    pulse('idle');
    await ctx.wait(200);

    pulse('out');
    const list = resultsOf(await ctx.call(R.g7));
    pulse('back');
    setCountries(list);
    await ctx.wait(900);

    const canada = list.find((one) => one.alpha2 === 'CA') ?? list[0];
    if (!canada) return;
    setCountry(text(canada.alpha2));
    setPath(R.regions('CA').path);
    pulse('out');
    const provinces = resultsOf(await ctx.call(R.regions('CA')));
    pulse('back');
    setRegions(provinces);
    await ctx.wait(900);

    const ontario = provinces.find((one) => one.code === 'CA-ON') ?? provinces[0];
    if (!ontario) return;
    setRegion(text(ontario.code));
    setPath(R.region('CA-ON').path);
    pulse('out');
    const detail = await ctx.call(R.region('CA-ON'));
    pulse('back');
    if (detail.json && typeof detail.json === 'object') setPlace(detail.json as Record_);
  });

  const picked = countries.find((one) => one.alpha2 === country);
  const capital = (place?.capital ?? null) as Record_ | null;
  const names = (place?.names ?? null) as Record_ | null;
  return (
    <Stage id={id} title={title} scene={scene}>
      <Wire label={`GET ${path}`} phase={wire.phase} beat={wire.beat} />
      <form className="uc-places" onSubmit={(event) => event.preventDefault()}>
        <label>
          <span>{say('uc.places.country')}</span>
          <select
            value={country}
            data-testid="uc-places-country"
            onChange={(event) => setCountry(event.target.value)}
            disabled={countries.length === 0}
          >
            <option value="">{say('uc.places.choose')}</option>
            {countries.map((one) => (
              <option key={text(one.alpha2)} value={text(one.alpha2)}>
                {labelOf(one)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{say('uc.places.region')}</span>
          <select
            value={region}
            data-testid="uc-places-region"
            onChange={(event) => setRegion(event.target.value)}
            disabled={regions.length === 0}
          >
            <option value="">{say('uc.places.choose')}</option>
            {regions.map((one) => (
              <option key={text(one.code)} value={text(one.code)}>
                {text(one.name)}
                {one.names && typeof one.names === 'object' && (one.names as Record_).ja
                  ? ` · ${text((one.names as Record_).ja)}`
                  : ''}
              </option>
            ))}
          </select>
        </label>
      </form>
      {place && (
        <div className="uc-place uc-in" data-testid="uc-places-card">
          <span className="uc-place-flag" aria-hidden="true">
            {text(picked?.emoji) || '🏳️'}
          </span>
          <div className="uc-place-text">
            <b lang={text(names?.ja) ? 'ja' : undefined}>
              {text(names?.ja) || text(place.name)} · {text(place.name)}
            </b>
            <small className="uc-sub">
              {text(place.code)} · {text(place.type)} · {capital ? text(capital.en) : '—'}
              {capital?.ja ? ` (${text(capital.ja)})` : ''}
            </small>
            <small className="uc-sub">
              {say('uc.places.population', { count: figure(place.population) })}
              {' · '}
              {say('uc.places.area', { count: figure(place.areaKm2) })}
            </small>
            <code className="uc-place-links">
              {R.map('CA-ON').path} · {text(place.flag) ? say('uc.places.flag') : '—'}
            </code>
          </div>
        </div>
      )}
    </Stage>
  );
}
