import { Check, Copy, Link2 } from 'lucide-react';
import { useState } from 'react';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import type { OutputFormat } from '../lib/config.ts';
import { isInBrowserUrl } from '../lib/inBrowserApi.ts';
import { curlCommand, fetchSnippet } from '../lib/request.ts';

type Snippet = 'url' | 'curl' | 'fetch';

const COPY_LABELS = { url: 'preview.copyUrl', curl: 'preview.copyCurl', fetch: 'preview.copyFetch' } as const;

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
  const { say, compose } = useSpeaker();
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
      {copied === key ? say('common.copied') : label}
    </button>
  );

  return (
    <div className="request-preview">
      <div className="preview-heading">
        <div className="snippet-tabs" role="tablist" aria-label={say('preview.snippets')}>
          {(['url', 'curl', 'fetch'] as const).map((option) => (
            <button
              type="button"
              key={option}
              role="tab"
              aria-selected={view === option}
              className={view === option ? 'active' : ''}
              onClick={() => setView(option)}
            >
              {option === 'url' ? say('preview.url') : option.toUpperCase()}
            </button>
          ))}
        </div>
        <span>{say('preview.params', { count: params })}</span>
      </div>
      <code data-testid="request-snippet">{text}</code>
      {isInBrowserUrl(url) && (
        <p className="preview-note">
          {compose('preview.inBrowser', {
            link: (
              <a href="https://github.com/spxis/rest-in-pieces#quick-start" target="_blank" rel="noreferrer">
                {say('preview.runItYourself')}
              </a>
            ),
          })}
        </p>
      )}
      <div className="preview-actions">
        {button('snippet', say(COPY_LABELS[view]), text)}
        {button('setup', say('preview.share'), null, <Link2 size={14} />)}
      </div>
    </div>
  );
}
