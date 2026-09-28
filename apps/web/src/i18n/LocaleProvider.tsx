import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { type Speaker, speaker, type UiLocale } from './speaker.ts';
import { readStoredLocale, resolveUiLocale, storeLocale } from './uiLocale.ts';

interface LocaleContext {
  speaker: Speaker;
  setLocale(locale: UiLocale): void;
}

const Context = createContext<LocaleContext>({ speaker: speaker('en'), setLocale: () => {} });

export function initialUiLocale(): UiLocale {
  return resolveUiLocale({
    search: window.location.search,
    stored: readStoredLocale(),
    languages: navigator.languages ?? [navigator.language],
  });
}

export function LocaleProvider({ initial, children }: { initial?: UiLocale; children: ReactNode }) {
  const [locale, setLocale] = useState<UiLocale>(() => initial ?? initialUiLocale());
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(
    () => ({
      speaker: speaker(locale),
      setLocale: (next: UiLocale) => {
        storeLocale(next);
        setLocale(next);
      },
    }),
    [locale],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useSpeaker = () => useContext(Context).speaker;
export const useSetLocale = () => useContext(Context).setLocale;
