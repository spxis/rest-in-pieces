import { ArrowLeft, ExternalLink } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useCopy } from '../hooks/useCopy.ts';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';
import { configToHash, defaultConfig } from '../lib/config.ts';
import { IN_BROWSER } from '../lib/inBrowserApi.ts';
import { playgroundHref } from '../lib/route.ts';
import { caseApiBase } from '../lib/useCaseApi.ts';
import { USE_CASES, type UseCase } from '../lib/useCases.ts';
import { Topbar } from './Topbar.tsx';
import { CodeBlock } from './useCases/CodeBlock.tsx';
import { FrontEndScene } from './useCases/FrontEndScene.tsx';
import { InternationalScene } from './useCases/InternationalScene.tsx';
import { MessyScene } from './useCases/MessyScene.tsx';
import { PlacesScene } from './useCases/PlacesScene.tsx';
import { RepeatableScene } from './useCases/RepeatableScene.tsx';
import { SchemaScene } from './useCases/SchemaScene.tsx';
import { SeedScene } from './useCases/SeedScene.tsx';
import { SignInScene } from './useCases/SignInScene.tsx';
import { SyntheticScene } from './useCases/SyntheticScene.tsx';
import { TutorialScene } from './useCases/TutorialScene.tsx';
import { UnhappyScene } from './useCases/UnhappyScene.tsx';
import './useCases/useCases.css';

const SCENES: Record<string, (props: { id: string; title: string }) => ReactNode> = {
  'front-end': FrontEndScene,
  'tutorial-api': TutorialScene,
  'unhappy-paths': UnhappyScene,
  'messy-data': MessyScene,
  'sign-in': SignInScene,
  repeatable: RepeatableScene,
  'seed-database': SeedScene,
  'from-schema': SchemaScene,
  international: InternationalScene,
  'healthcare-fintech': SyntheticScene,
  'places-pickers': PlacesScene,
};

function tryItHref(useCase: UseCase): string | null {
  if (!useCase.playground) return null;
  const base = caseApiBase();
  return `${playgroundHref(import.meta.env.BASE_URL)}#${configToHash({ ...defaultConfig(base), ...useCase.playground, apiBase: base })}`;
}

function Card({
  useCase,
  index,
  copied,
  onCopy,
}: {
  useCase: UseCase;
  index: number;
  copied: string | null;
  onCopy: (value: string, key: string) => void;
}) {
  const { say } = useSpeaker();
  const Scene = SCENES[useCase.id];
  const title = say(useCase.title);
  const heading = `uc-title-${useCase.id}`;
  const href = tryItHref(useCase);
  return (
    <article className="uc-card" id={useCase.id} aria-labelledby={heading} data-testid={`uc-${useCase.id}`}>
      <header className="uc-card-head">
        <span className="uc-number" aria-hidden="true">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div>
          <h2 id={heading}>{title}</h2>
          <p className="uc-problem">{say(useCase.problem)}</p>
        </div>
      </header>
      <div className="uc-card-body">
        <div className="uc-illustration">
          {Scene && <Scene id={useCase.id} title={title} />}
          <p className="uc-how">{say(useCase.how)}</p>
        </div>
        <div className="uc-snippets">
          {useCase.snippets.map((snippet) => (
            <CodeBlock key={snippet.label} id={useCase.id} snippet={snippet} copied={copied} onCopy={onCopy} />
          ))}
          {href && (
            <a className="uc-try" href={href}>
              <ExternalLink size={14} aria-hidden="true" />
              {say('uc.try')}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/** The use cases page: eleven jobs, each with its request and an animation driven by the real API. */
export default function UseCasesPage() {
  const { say } = useSpeaker();
  const { copied, copy } = useCopy();
  const base = caseApiBase();

  useEffect(() => {
    document.title = say('uc.documentTitle');
  }, [say]);

  return (
    <div className="app-shell">
      <Topbar apiBase={base} online={null} view="use-cases" />
      <main className="workspace uc-page">
        <section className="uc-intro">
          <p className="eyebrow">
            <span>{say('uc.eyebrow')}</span>
            <span className="eyebrow-line" />
          </p>
          <h1>{say('uc.title')}</h1>
          <p className="intro">{say('uc.intro')}</p>
          <p className="uc-where" data-testid="uc-where">
            {IN_BROWSER ? say('uc.whereTab') : say('uc.whereServer', { base })} {say('uc.baseNote')}
          </p>
          <a className="uc-back" href={playgroundHref(import.meta.env.BASE_URL)}>
            <ArrowLeft size={14} aria-hidden="true" />
            {say('uc.back')}
          </a>
          <nav className="uc-jump" aria-label={say('uc.jump')}>
            <ol>
              {USE_CASES.map((useCase, index) => (
                <li key={useCase.id}>
                  <a href={`#${useCase.id}`}>
                    <span className="uc-jump-n" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {say(useCase.title)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </section>
        {USE_CASES.map((useCase, index) => (
          <Card key={useCase.id} useCase={useCase} index={index} copied={copied} onCopy={copy} />
        ))}
      </main>
    </div>
  );
}
