import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './style.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { LocaleProvider } from './i18n/LocaleProvider.tsx';
import { applyTheme, readTheme } from './lib/theme.ts';

// Before the first paint, so a pinned theme never flashes the other one.
applyTheme(readTheme());

// Written out rather than read from IN_BROWSER so every other build drops the API bundle entirely.
if (import.meta.env.MODE === 'pages') (await import('./lib/inBrowserApi.ts')).installInBrowserApi();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element was not found');

createRoot(rootElement).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
