import { useState } from 'react';
import { useSpeaker } from '../../i18n/LocaleProvider.tsx';
import { DISPLAY_BASE, R } from '../../lib/useCases.ts';
import { Stage, useScene } from './scene.tsx';

interface Block {
  command: string;
  typed: number;
  output: string[];
}

const COMMANDS = [
  { request: R.sql, label: 'sql' },
  { request: R.ndjson, label: 'ndjson' },
] as const;

const linesOf = (body: string) => body.split('\n').filter((line) => line.trim() !== '');

/** Use case 7: the commands that write a database's rows, with the real INSERTs and NDJSON they print. */
export function SeedScene({ id, title }: { id: string; title: string }) {
  const { say } = useSpeaker();
  const [blocks, setBlocks] = useState<Block[]>([]);

  const scene = useScene(async (ctx) => {
    setBlocks([]);
    const update = (index: number, patch: Partial<Block>) =>
      setBlocks((now) => now.map((block, at) => (at === index ? { ...block, ...patch } : block)));
    for (const [index, { request }] of COMMANDS.entries()) {
      const command = `curl '${DISPLAY_BASE}${request.path}'`;
      setBlocks((now) => [...now, { command, typed: 0, output: [] }]);
      const step = Math.max(1, Math.ceil(command.length / 40));
      for (let typed = step; typed < command.length + step; typed += step) {
        update(index, { typed: Math.min(typed, command.length) });
        await ctx.wait(28);
      }
      const lines = linesOf((await ctx.call(request)).text);
      for (let shown = 1; shown <= lines.length; shown += 1) {
        update(index, { output: lines.slice(0, shown) });
        await ctx.wait(260);
      }
      await ctx.wait(350);
    }
  });

  return (
    <Stage id={id} title={title} scene={scene}>
      <figure className="uc-terminal" aria-label={say('uc.seed-database.terminal')}>
        {blocks.map((block) => (
          <div key={block.command} data-testid="uc-terminal-block">
            <p className="uc-prompt">
              <span aria-hidden="true">$ </span>
              {block.command.slice(0, block.typed)}
            </p>
            {block.output.map((line) => (
              <p key={line} className="uc-out uc-in">
                {line}
              </p>
            ))}
          </div>
        ))}
      </figure>
    </Stage>
  );
}
