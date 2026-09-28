import { ExternalLink, Workflow } from 'lucide-react';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import { isLocalApi, trimBase } from '../lib/request.ts';
import { LanguagePicker } from './LanguagePicker.tsx';

export function Topbar({ apiBase, online }: { apiBase: string; online: boolean | null }) {
  const { say } = useSpeaker();
  const local = isLocalApi(apiBase);
  const label = say(local === null ? 'topbar.invalid' : local ? 'topbar.local' : 'topbar.remote');
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label={say('topbar.home')}>
        <span className="brand-mark">
          <Workflow size={19} strokeWidth={2.2} />
        </span>
        <span lang="en">
          REST <b>in</b> Pieces
        </span>
      </a>
      <div className="topbar-right">
        <span
          className={online === false ? 'environment offline' : 'environment'}
          title={online === false ? say('topbar.offline') : undefined}
        >
          <i /> {label}
        </span>
        <a className="docs-link" href={`${trimBase(apiBase)}/docs`} target="_blank" rel="noreferrer">
          {say('topbar.docs')} <ExternalLink size={14} />
        </a>
        <LanguagePicker />
      </div>
    </header>
  );
}
