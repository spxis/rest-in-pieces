import { RotateCcw } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import { call, caseApiBase, type Reply, type Streamed, stream, type UseCaseRequest } from '../../lib/useCaseApi.ts';

export type SceneStatus = 'idle' | 'running' | 'done' | 'error';

/** Thrown inside a script that a replay (or leaving the page) has replaced, so it stops where it stands. */
const STALE = Symbol('stale scene');

/** The API every animation calls. A test supplies its own. */
export const BaseContext = createContext<string | null>(null);

export interface SceneContext {
  /** Whether the reader asked for no motion: the script then skips its waits and shows the finished state. */
  reduced: boolean;
  wait(ms: number): Promise<void>;
  call(request: UseCaseRequest): Promise<Reply>;
  stream(request: UseCaseRequest, onPiece: (text: string, atMs: number) => void): Promise<Streamed>;
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export interface Scene {
  ref: RefObject<HTMLDivElement | null>;
  status: SceneStatus;
  replay(): void;
}

/**
 * Runs a script of real requests and waits once, when its stage first scrolls into view, and again whenever the
 * reader presses Replay. A script only ever runs to its end: nothing here loops or polls.
 */
export function useScene(script: (ctx: SceneContext) => Promise<void>): Scene {
  const provided = useContext(BaseContext);
  const base = provided ?? caseApiBase();
  const ref = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<SceneStatus>('idle');
  const run = useRef(0);
  const latest = useRef(script);
  latest.current = script;

  const play = useCallback(() => {
    const id = ++run.current;
    const reduced = prefersReducedMotion();
    const live = () => {
      if (run.current !== id) throw STALE;
    };
    const ctx: SceneContext = {
      reduced,
      wait: async (ms) => {
        if (!reduced) await new Promise((resolve) => setTimeout(resolve, ms));
        live();
      },
      call: async (request) => {
        const reply = await call(base, request);
        live();
        return reply;
      },
      stream: async (request, onPiece) => {
        const streamed = await stream(base, request, (text, at) => {
          live();
          onPiece(text, at);
        });
        live();
        return streamed;
      },
    };
    setStatus('running');
    latest
      .current(ctx)
      .then(() => run.current === id && setStatus('done'))
      .catch((error: unknown) => {
        if (error !== STALE && run.current === id) setStatus('error');
      });
  }, [base]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      play();
      return () => {
        run.current += 1;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        play();
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      run.current += 1;
    };
  }, [play]);

  return { ref, status, replay: play };
}

/** The frame every illustration sits in: its state for tests and readers, and the Replay button. */
export function Stage({
  id,
  title,
  scene,
  className = '',
  children,
}: {
  id: string;
  title: string;
  scene: Scene;
  className?: string;
  children: ReactNode;
}) {
  const { say } = useSpeaker();
  return (
    <div
      className={`uc-stage ${className}`.trim()}
      ref={scene.ref}
      data-state={scene.status}
      data-testid={`uc-stage-${id}`}
    >
      <div className="uc-stage-body">
        {children}
        {scene.status === 'error' && (
          <p className="uc-error" role="alert">
            {say('uc.error')}
          </p>
        )}
      </div>
      <div className="uc-stage-bar">
        <span role="status" className="sr-only">
          {say(
            scene.status === 'running'
              ? 'uc.status.running'
              : scene.status === 'done'
                ? 'uc.status.done'
                : 'uc.status.idle',
          )}
        </span>
        <button
          type="button"
          className="uc-replay"
          onClick={scene.replay}
          aria-label={say('uc.replayLabel', { title })}
          data-testid={`uc-replay-${id}`}
        >
          <RotateCcw size={13} aria-hidden="true" />
          {say('uc.replay')}
        </button>
      </div>
    </div>
  );
}

export type WirePhase = 'idle' | 'out' | 'back' | 'fail';

/** A request leaving for the API and its answer coming back, as a dot along a line. `beat` restarts the dot. */
export function useWire() {
  const [wire, setWire] = useState<{ phase: WirePhase; beat: number }>({ phase: 'idle', beat: 0 });
  const pulse = useCallback((phase: WirePhase) => setWire((now) => ({ phase, beat: now.beat + 1 })), []);
  return { wire, pulse };
}

export function Wire({ label, phase, beat }: { label: string; phase: WirePhase; beat: number }) {
  const { say } = useSpeaker();
  return (
    <div className="uc-wire" data-phase={phase}>
      <div className="uc-wire-line" aria-hidden="true">
        <span>{say('uc.wire.you')}</span>
        <span className="uc-wire-track">{phase !== 'idle' && <i key={beat} className="uc-wire-dot" />}</span>
        <span>API</span>
      </div>
      <code className="uc-wire-label">{label}</code>
    </div>
  );
}

/** Two letters for a round tile, from a name in any script. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0] ?? '?'];
  return letters
    .map((word) => [...(word ?? '')][0] ?? '')
    .join('')
    .toUpperCase();
}

/** A hue from a number, so the same person is always the same colour. */
export const hueOf = (id: number | string): number => {
  const text = String(id);
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
};

export function Avatar({ name, id }: { name: string; id: number | string }) {
  return (
    <span className="uc-avatar" style={{ ['--hue' as string]: hueOf(id) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The records of a list response, or none. */
export function resultsOf(reply: Reply): Array<Record<string, unknown>> {
  const body = reply.json;
  if (Array.isArray(body)) return body.filter(isRecord);
  if (isRecord(body) && Array.isArray(body.results)) return body.results.filter(isRecord);
  return [];
}

export const text = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value);
