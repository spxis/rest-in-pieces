import { ExternalLink, Workflow } from 'lucide-react';
import { isLocalApi, trimBase } from '../lib/request.ts';

export function Topbar({ apiBase, online }: { apiBase: string; online: boolean | null }) {
  const local = isLocalApi(apiBase);
  const label = local === null ? 'INVALID URL' : local ? 'LOCAL API' : 'REMOTE API';
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="REST in Pieces home">
        <span className="brand-mark">
          <Workflow size={19} strokeWidth={2.2} />
        </span>
        <span>
          REST <b>in</b> Pieces
        </span>
      </a>
      <div className="topbar-right">
        <span
          className={online === false ? 'environment offline' : 'environment'}
          title={online === false ? 'Not reachable' : undefined}
        >
          <i /> {label}
        </span>
        <a className="docs-link" href={`${trimBase(apiBase)}/docs`} target="_blank" rel="noreferrer">
          API docs <ExternalLink size={14} />
        </a>
      </div>
    </header>
  );
}
