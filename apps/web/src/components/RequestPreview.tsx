import { Check, Copy, Link2 } from 'lucide-react';
import { useState } from 'react';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import type { OutputFormat } from '../lib/config.ts';
import { isInBrowserUrl } from '../lib/inBrowserApi.ts';
import { REPO_URL } from '../lib/links.ts';
import type { SendOptions } from '../lib/request.ts';
import { SNIPPET_KINDS, SNIPPET_LABELS, type SnippetKind, snippetFor } from '../lib/snippets.ts';

export function RequestPreview({
  url,
  apiBase,
  format,
  request,
  account,
  session,
  copied,
  onCopy,
  onShare,
}: {
  url: string;
  apiBase: string;
  format: OutputFormat;
  /** The method and body; a GET sends only the URL. */
  request: SendOptions;
  /** The username the playground signed in with, when requests carry a token. */
  account: string | null;
  /** Whether the API keeps writes, so the integration snippets keep them too. */
  session: boolean;
  copied: string | null;
  onCopy: (value: string, key: string) => void;
  onShare: () => void;
}) {
  const { say, compose } = useSpeaker();
  const [view, setView] = useState<SnippetKind>('url');
  const text = snippetFor(view, {
    ...request,
    url,
    apiBase,
    format,
    session,
    ...(account ? { account } : {}),
  });
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
          {SNIPPET_KINDS.map((option) => (
            <button
              type="button"
              key={option}
              role="tab"
              aria-selected={view === option}
              className={view === option ? 'active' : ''}
              onClick={() => setView(option)}
            >
              {option === 'url' ? say('preview.url') : SNIPPET_LABELS[option]}
            </button>
          ))}
        </div>
        <span>{say('preview.params', { count: params })}</span>
      </div>
      <code data-testid="request-snippet" className={view === 'url' ? '' : 'multiline'}>
        {text}
      </code>
      {isInBrowserUrl(url) && (
        <p className="preview-note">
          {compose('preview.inBrowser', {
            link: (
              <a href={`${REPO_URL}#run-it`} target="_blank" rel="noreferrer">
                {say('preview.runItYourself')}
              </a>
            ),
          })}
        </p>
      )}
      <div className="preview-actions">
        {button(
          'snippet',
          view === 'url' ? say('preview.copyUrl') : say('preview.copySnippet', { name: SNIPPET_LABELS[view] }),
          text,
        )}
        {button('setup', say('preview.share'), null, <Link2 size={14} />)}
      </div>
    </div>
  );
}
