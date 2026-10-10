import { Check, Copy } from 'lucide-react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import type { Snippet } from '../../lib/useCases.ts';

/** A snippet that scrolls inside its own box and copies with one press. */
export function CodeBlock({
  id,
  snippet,
  copied,
  onCopy,
}: {
  id: string;
  snippet: Snippet;
  copied: string | null;
  onCopy: (value: string, key: string) => void;
}) {
  const { say } = useSpeaker();
  const key = `${id}:${snippet.label}`;
  return (
    <figure className="uc-code">
      <figcaption>
        <span>{snippet.label}</span>
        <button
          type="button"
          className="quiet-button"
          onClick={() => onCopy(snippet.code, key)}
          aria-label={say('uc.copy', { label: snippet.label })}
          data-testid={`uc-copy-${id}-${snippet.label}`}
        >
          {copied === key ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied === key ? say('common.copied') : say('uc.copyShort')}
        </button>
      </figcaption>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling code box has to take the keyboard to be read */}
      <pre tabIndex={0}>
        <code>{snippet.code}</code>
      </pre>
    </figure>
  );
}
