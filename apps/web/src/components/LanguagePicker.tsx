import { useSetLocale, useSpeaker } from '../i18n/LocaleProvider.tsx';
import { UI_LOCALES } from '../i18n/speaker.ts';

/** English and 日本語, each named in its own language so a reader who can't read the other still finds theirs. */
export function LanguagePicker() {
  const { locale, say } = useSpeaker();
  const setLocale = useSetLocale();
  return (
    <fieldset className="language-picker">
      <legend className="sr-only">{say('language.label')}</legend>
      {UI_LOCALES.map((option) => (
        <button
          type="button"
          key={option.locale}
          lang={option.tag}
          aria-pressed={locale === option.locale}
          className={locale === option.locale ? 'active' : ''}
          onClick={() => setLocale(option.locale)}
        >
          {option.endonym}
        </button>
      ))}
    </fieldset>
  );
}
