import { Check, Copy, Link2 } from 'lucide-react';
import { useState } from 'react';
import type { OutputFormat } from '../lib/config.ts';
import { curlCommand, fetchSnippet } from '../lib/request.ts';

type Snippet = 'url' | 'curl' | 'fetch';

export function RequestPreview({
  url,
  format,
  copied,
  onCopy,
  onShare,
}: {
  url: string;
  format: OutputFormat;
  copied: string | null;
  onCopy: (value: string, key: string) => void;
  onShare: () => void;
}) {
  const [view, setView] = useState<Snippet>('url');
  const text = view === 'url' ? url : view === 'curl' ? curlCommand(url, format) : fetchSnippet(url, format);
  const params = new URL(url, 'http://x').searchParams.size;

  const button = (key: string, label: string, value: string | null, icon = <Copy size={14} />) => (
    <button
      type="button"
      className="quiet-button"
      onClick={() => (value === null ? onShare() : onCopy(value, key))}
      title={label}
    >
      {copied === key ? <Check size={14} /> : icon}
      {copied === key ? 'Copied' : label}
    </button>
  );

  return (
    <div className="request-preview">
      <div className="preview-heading">
        <div className="snippet-tabs" role="tablist" aria-label="Request snippet">
          {(['url', 'curl', 'fetch'] as const).map((option) => (
            <button
              type="button"
              key={option}
              role="tab"
              aria-selected={view === option}
              className={view === option ? 'active' : ''}
              onClick={() => setView(option)}
            >
              {option === 'url' ? 'REQUEST URL' : option.toUpperCase()}
            </button>
          ))}
        </div>
        <span>{params} params</span>
      </div>
      <code data-testid="request-snippet">{text}</code>
      <div className="preview-actions">
        {button('snippet', view === 'url' ? 'Copy URL' : `Copy ${view}`, text)}
        {button('setup', 'Share setup', null, <Link2 size={14} />)}
      </div>
    </div>
  );
}
