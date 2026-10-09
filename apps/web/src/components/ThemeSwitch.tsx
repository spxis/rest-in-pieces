import { Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import { applyTheme, nextTheme, readTheme, type Theme } from '../lib/theme.ts';

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
const LABELS = { system: 'theme.system', light: 'theme.light', dark: 'theme.dark' } as const;

/** One button that steps through the system's colours, light and dark. */
export function ThemeSwitch() {
  const { say } = useSpeaker();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const Icon = ICONS[theme];
  const label = say('theme.label', { theme: say(LABELS[theme]) });
  return (
    <button
      type="button"
      className="theme-switch"
      title={label}
      aria-label={label}
      data-theme-choice={theme}
      onClick={() => {
        const next = nextTheme(theme);
        applyTheme(next);
        setTheme(next);
      }}
    >
      <Icon size={14} />
    </button>
  );
}
